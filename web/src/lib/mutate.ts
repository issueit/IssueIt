import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "./api";
import { useOrg } from "./session";
import { toast, toastError } from "../components/ui/Toast";

type Options<TVars, TResult> = {
  method?: string;
  path: (vars: TVars) => string;
  body?: (vars: TVars) => unknown;
  /** Query domains to refresh afterwards. */
  invalidates: string[];
  success?: string | ((result: TResult, vars: TVars) => string | undefined);
  /** "Couldn't …" message for the toast when this fails outside a form. */
  failure?: string;
};

/**
 * The mutation idiom: send the command, refresh the affected domains, say
 * what happened in past tense, and offer a retry when it fails. Forms that
 * show their own errors leave `failure` unset and read `error` instead.
 */
export function useAction<TVars = void, TResult = unknown>(opts: Options<TVars, TResult>) {
  const qc = useQueryClient();
  const { orgId, path } = useOrg();
  const mutation = useMutation({
    mutationFn: (vars: TVars) =>
      api<TResult>(path(opts.path(vars)), { method: opts.method ?? "POST", body: opts.body ? opts.body(vars) : opts.method === "DELETE" ? undefined : {} }),
    onSuccess: (result, vars) => {
      opts.invalidates.forEach((d) => qc.invalidateQueries({ queryKey: ["org", orgId, d] }));
      const msg = typeof opts.success === "function" ? opts.success(result, vars) : opts.success;
      if (msg) toast(msg);
    },
    onError: (err, vars) => {
      if (opts.failure) toastError(describeError(err, opts.failure), () => mutation.mutate(vars));
    },
  });
  return mutation;
}
