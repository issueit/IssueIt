import type { Provider } from "../types";
import { chats } from "./chat";
import { dataStores } from "./data";
import { helpdesks } from "./helpdesk";
import { notifiers } from "./notify";
import { ops } from "./ops";
import { trackers } from "./trackers";

/** Every catalogue integration. The hand-written providers come first in the registry. */
export const catalogue: Provider[] = [...trackers, ...helpdesks, ...dataStores, ...chats, ...notifiers, ...ops];
