--[[
	Issueit for Roblox

	Sends bug reports from a Roblox experience to Issueit, which delivers
	them to wherever your team already works: Discord, GitHub, Linear,
	Jira, Slack, a webhook of your own.

	Put this ModuleScript in ReplicatedStorage. Start it from a server
	Script; never put your secret key in this module or anywhere a client
	can read it.

	-- ServerScriptService/Issueit.server.luau
	local Issueit = require(game.ReplicatedStorage.Issueit)
	Issueit.init({
		project = "prj_...",
		key = game:GetService("HttpService"):GetSecret("issueit"), -- or "sk_live_..." from a server script
		playerReports = true, -- lets players file reports from your own UI
	})

	-- A LocalScript, behind your own "Report a bug" button
	local Issueit = require(game.ReplicatedStorage.Issueit)
	Issueit.startClient()
	Issueit.send({ title = "Stuck in the wall by the shop", description = "..." })

	Turn on Game Settings > Security > Allow HTTP Requests first.
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local LogService = game:GetService("LogService")
local ScriptContext = game:GetService("ScriptContext")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Issueit = {}
Issueit.VERSION = "0.1.0"

local REMOTE_NAME = "IssueitRemote"
local MAX_LOGS = 50
local PREFIX = "[Issueit]"

local options = nil
local queue = {}
local working = false
local logs = {}
local lastSentError = {}
local playerHistory = {}
local warnedDisabled = false

local function nowMs()
	return DateTime.now().UnixTimestampMillis
end

local function clip(value, max)
	if type(value) ~= "string" then
		return nil
	end
	value = value:gsub("^%s+", ""):gsub("%s+$", "")
	if #value == 0 then
		return nil
	end
	if #value > max then
		return value:sub(1, max - 3) .. "..."
	end
	return value
end

local levels = {
	[Enum.MessageType.MessageOutput] = "log",
	[Enum.MessageType.MessageInfo] = "info",
	[Enum.MessageType.MessageWarning] = "warn",
	[Enum.MessageType.MessageError] = "error",
}

--- Keeps the last few lines of output, so a report shows what happened just before it.
local function keepLogs()
	LogService.MessageOut:Connect(function(message, messageType)
		if message:sub(1, #PREFIX) == PREFIX then
			return
		end
		table.insert(logs, { at = nowMs(), level = levels[messageType] or "log", message = message:sub(1, 1000) })
		if #logs > MAX_LOGS then
			table.remove(logs, 1)
		end
	end)
end

local function recentLogs()
	local at = nowMs()
	local out = {}
	for _, entry in logs do
		table.insert(out, { t = math.max(0, at - entry.at), level = entry.level, message = entry.message, stack = entry.stack })
	end
	return out
end

--- What every report says about the server it came from.
local function serverDetails()
	local kind = "public"
	if game.PrivateServerId ~= "" then
		kind = if game.PrivateServerOwnerId ~= 0 then "private" else "reserved"
	end
	return {
		place_id = tostring(game.PlaceId),
		universe_id = tostring(game.GameId),
		place_version = tostring(game.PlaceVersion),
		job_id = game.JobId,
		server_kind = kind,
		players = #Players:GetPlayers(),
	}
end

local function playerDetails(player)
	return {
		player_id = tostring(player.UserId),
		player_name = player.Name,
		player_display_name = player.DisplayName,
		account_age_days = player.AccountAge,
	}
end

local function authorization()
	local key = options.key
	if typeof(key) == "Secret" then
		return key:AddPrefix("Bearer ")
	end
	return "Bearer " .. key
end

--- Sends one report. Returns true, the parsed answer; or false, a reason, and whether trying again might work.
local function post(payload)
	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url = options.endpoint .. "/v1/" .. options.project .. "/reports",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["Authorization"] = authorization(),
				-- The same key on a retry files one report, not two.
				["Idempotency-Key"] = payload.idempotency_key,
			},
			Body = HttpService:JSONEncode(payload),
		})
	end)
	if not ok then
		if tostring(response):find("not enabled") then
			if not warnedDisabled then
				warnedDisabled = true
				warn(PREFIX, "HTTP requests are off. Turn on Game Settings > Security > Allow HTTP Requests.")
			end
			return false, tostring(response), false
		end
		return false, tostring(response), true
	end
	if response.Success then
		local decoded = nil
		pcall(function()
			decoded = HttpService:JSONDecode(response.Body)
		end)
		return true, decoded
	end
	local retry = response.StatusCode == 429 or response.StatusCode >= 500
	return false, ("HTTP %d: %s"):format(response.StatusCode, response.Body:sub(1, 300)), retry
end

local function work()
	if working then
		return
	end
	working = true
	task.spawn(function()
		while #queue > 0 do
			local item = table.remove(queue, 1)
			local ok, result, retry = post(item.payload)
			if ok then
				if item.done then
					item.done(true, result)
				end
			elseif retry and item.tries < 5 then
				item.tries += 1
				table.insert(queue, 1, item)
				task.wait(math.min(2 ^ item.tries, 30))
			else
				warn(PREFIX, "Couldn't send a report:", result)
				if item.done then
					item.done(false, result)
				end
			end
		end
		working = false
	end)
end

--- Turns what the caller wrote into what the intake API reads.
local function build(report)
	local metadata = serverDetails()
	for k, v in report.metadata or {} do
		metadata[tostring(k)] = v
	end
	local player = report.player
	if player then
		for k, v in playerDetails(player) do
			metadata[k] = v
		end
	end
	local payload = {
		title = clip(report.title, 200) or "Report from Roblox",
		description = clip(report.description, 20000),
		priority = report.priority,
		source = "roblox",
		environment = report.environment or options.environment,
		release = options.release,
		fingerprint = clip(report.fingerprint, 200),
		name = player and player.Name or nil,
		page_url = if game.PlaceId ~= 0 then ("https://www.roblox.com/games/%d"):format(game.PlaceId) else nil,
		metadata = metadata,
		context = player and { language = player.LocaleId } or nil,
		diagnostics = { console = report.logs or (if report.attachLogs == false then {} else recentLogs()) },
		idempotency_key = HttpService:GenerateGUID(false),
	}
	if options.beforeSend then
		return options.beforeSend(payload)
	end
	return payload
end

local function enqueue(report, done)
	assert(options, "Call Issueit.init() on the server before sending reports.")
	local payload = build(report)
	if not payload then
		if done then
			done(false, "beforeSend dropped it")
		end
		return
	end
	table.insert(queue, { payload = payload, tries = 0, done = done })
	work()
end

--[[
	Files a report without waiting.

	Issueit.report({
		title = "Shop purchase failed",
		description = "ProcessReceipt returned NotProcessedYet three times",
		priority = "high",          -- low, medium, high or critical
		player = player,            -- optional: who it happened to
		fingerprint = "shop:receipt",-- optional: reports with the same one are grouped
		metadata = { product = 12345 },
	})
]]
function Issueit.report(report)
	enqueue(report, nil)
end

--- The same, but waits. Returns true and Issueit's answer, or false and why not.
function Issueit.reportAsync(report)
	local thread = coroutine.running()
	local finished, okResult, result = false, nil, nil
	enqueue(report, function(ok, value)
		finished, okResult, result = true, ok, value
		if coroutine.status(thread) == "suspended" then
			task.spawn(thread)
		end
	end)
	if not finished then
		coroutine.yield()
	end
	return okResult, result
end

--- Script errors on the server, each kind sent at most once a minute per server.
local function captureError(message, stack, origin, player)
	local text = clip(message, 1000) or "Script error"
	-- One per server, not one per player: the same client error for everyone is one bug.
	local key = (if player then "client:" else "server:") .. text
	local last = lastSentError[key]
	if last and os.clock() - last < options.errorCooldown then
		return
	end
	lastSentError[key] = os.clock()
	local where = if typeof(origin) == "Instance" then origin:GetFullName() else nil
	local parts = { text }
	stack = clip(stack, 4000)
	if stack then
		table.insert(parts, "```\n" .. stack .. "\n```")
	end
	if where then
		table.insert(parts, "Script: " .. where)
	end
	local console = recentLogs()
	table.insert(console, { t = 0, level = "error", message = text, stack = if stack then stack:sub(1, 1500) else nil })
	Issueit.report({
		title = clip((if player then "Client error: " else "Error: ") .. text, 200),
		description = table.concat(parts, "\n\n"),
		priority = "high",
		player = player,
		fingerprint = text:sub(1, 200),
		logs = console,
		metadata = where and { script = where } or nil,
	})
end

--- How often one player may file reports, so a held-down button isn't a flood.
local function allowed(player, kind)
	local history = playerHistory[player.UserId]
	if not history then
		history = { report = {}, error = {} }
		playerHistory[player.UserId] = history
	end
	local limit = if kind == "error" then options.clientErrorLimit else options.playerReportLimit
	local times = history[kind]
	local cutoff = os.clock() - limit.per
	while times[1] and times[1] < cutoff do
		table.remove(times, 1)
	end
	if #times >= limit.count then
		return false
	end
	table.insert(times, os.clock())
	return true
end

local priorities = { low = true, medium = true, high = true, critical = true }

--- Whatever a client sends is untrusted: checked, clipped and limited before it's sent on.
local function fromClient(player, kind, data)
	if type(data) ~= "table" then
		return
	end
	if kind == "error" and not options.clientErrors then
		return
	end
	if kind ~= "error" and kind ~= "report" then
		return
	end
	if kind == "report" and not options.playerReports then
		return
	end
	if not allowed(player, kind) then
		return
	end
	local console = {}
	if type(data.logs) == "table" then
		for i, entry in data.logs do
			if i > 30 then
				break
			end
			if type(entry) == "table" and type(entry.message) == "string" and type(entry.t) == "number" then
				table.insert(console, {
					t = math.clamp(math.floor(entry.t), 0, 86400000),
					level = if entry.level == "error" or entry.level == "warn" or entry.level == "info" then entry.level else "log",
					message = entry.message:sub(1, 500),
				})
			end
		end
	end
	if kind == "error" then
		captureError(data.message, type(data.stack) == "string" and data.stack or nil, nil, player)
		return
	end
	Issueit.report({
		title = clip(data.title, 200) or "Report from a player",
		description = clip(data.description, 4000),
		priority = if type(data.priority) == "string" and priorities[data.priority] then data.priority else nil,
		player = player,
		logs = console,
		metadata = { reported_from = "in-game", category = clip(data.category, 60) },
	})
end

--[[
	Starts Issueit on the server. Call once, from a server Script.

	project         required. The project id, prj_...
	key             required. A secret key (sk_live_...), or a Secret from HttpService:GetSecret.
	endpoint        where reports go. Defaults to https://drop.issueit.app; your own install's address if you self-host.
	environment     defaults to "studio" in Studio and "production" elsewhere.
	release         defaults to the place version, so reports say which build they came from.
	captureErrors   send server script errors as reports. Default true.
	captureLogs     attach the last 50 lines of server output to each report. Default true.
	playerReports   let players file reports with Issueit.send() from a LocalScript. Default false.
	clientErrors    let clients send their script errors with Issueit.startClient({ captureErrors = true }). Default false.
	errorCooldown   seconds before the same error is sent again from this server. Default 60.
	playerReportLimit { count = 3, per = 600 }: reports one player may send in that many seconds.
	beforeSend      function(payload) returning the payload to send, or nil to drop it.
]]
function Issueit.init(config)
	assert(RunService:IsServer(), "Issueit.init() runs on the server. Clients use Issueit.startClient() and Issueit.send().")
	assert(type(config) == "table", "Pass Issueit.init() a table of options.")
	assert(type(config.project) == "string" and config.project:match("^prj_"), "Issueit.init(): project must be your project id, prj_...")
	assert(type(config.key) == "string" or typeof(config.key) == "Secret", "Issueit.init(): key must be a secret key, or a Secret from HttpService:GetSecret.")
	if type(config.key) == "string" then
		assert(config.key:match("^sk_"), "Issueit.init(): key must be a secret key, sk_live_...")
	end
	if options then
		warn(PREFIX, "Issueit.init() was called twice; the second call is ignored.")
		return
	end
	options = {
		project = config.project,
		key = config.key,
		endpoint = (config.endpoint or "https://drop.issueit.app"):gsub("/+$", ""),
		environment = config.environment or (if RunService:IsStudio() then "studio" else "production"),
		release = config.release or tostring(game.PlaceVersion),
		captureErrors = config.captureErrors ~= false,
		captureLogs = config.captureLogs ~= false,
		playerReports = config.playerReports == true,
		clientErrors = config.clientErrors == true,
		errorCooldown = config.errorCooldown or 60,
		playerReportLimit = config.playerReportLimit or { count = 3, per = 600 },
		clientErrorLimit = { count = 5, per = 60 },
		beforeSend = config.beforeSend,
	}

	if options.captureLogs then
		keepLogs()
	end
	if options.captureErrors then
		ScriptContext.Error:Connect(function(message, stack, origin)
			captureError(message, stack, origin, nil)
		end)
	end
	if options.playerReports or options.clientErrors then
		local remote = ReplicatedStorage:FindFirstChild(REMOTE_NAME) or Instance.new("RemoteEvent")
		remote.Name = REMOTE_NAME
		remote.Parent = ReplicatedStorage
		remote.OnServerEvent:Connect(function(player, kind, data)
			fromClient(player, kind, data)
		end)
		Players.PlayerRemoving:Connect(function(player)
			playerHistory[player.UserId] = nil
		end)
	end

	-- Whatever is still queued when the server shuts down gets a last chance.
	game:BindToClose(function()
		local deadline = os.clock() + 20
		work()
		while (#queue > 0 or working) and os.clock() < deadline do
			task.wait(0.25)
		end
	end)
end

--[[ ------------------------------------------------------------ client ]]

local client = nil

--[[
	Call once from a LocalScript before Issueit.send().
	captureErrors = true also sends this client's script errors (the server must allow clientErrors).
]]
function Issueit.startClient(config)
	assert(RunService:IsClient(), "Issueit.startClient() runs in a LocalScript.")
	if client then
		return
	end
	config = config or {}
	local remote = ReplicatedStorage:WaitForChild(REMOTE_NAME, 15)
	if not remote then
		warn(PREFIX, "No reports remote. Start Issueit on the server with playerReports = true.")
		return
	end
	client = { remote = remote }
	keepLogs()
	if config.captureErrors then
		ScriptContext.Error:Connect(function(message, stack)
			remote:FireServer("error", { message = tostring(message):sub(1, 1000), stack = tostring(stack):sub(1, 1500) })
		end)
	end
end

--[[
	Sends a report from the player using this client. The server adds who
	they are and which server they're on, and limits how often they can.

	Issueit.send({ title = "...", description = "...", category = "Bug" })
]]
function Issueit.send(report)
	assert(RunService:IsClient(), "Issueit.send() runs in a LocalScript. On the server, use Issueit.report().")
	if not client then
		Issueit.startClient()
	end
	if not client then
		return false
	end
	client.remote:FireServer("report", {
		title = report.title,
		description = report.description,
		category = report.category,
		priority = report.priority,
		logs = recentLogs(),
	})
	return true
end

return Issueit
