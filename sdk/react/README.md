# @issueit/react

[Issueit](https://issueit.app) for React: an error boundary that files the bug, and a hook for reporting one yourself.

```sh
npm install @issueit/react
```

```tsx
import { IssueitProvider, ErrorBoundary } from "@issueit/react";

<IssueitProvider project="prj_abc123" release={import.meta.env.VITE_GIT_SHA}>
  <ErrorBoundary fallback={({ retry }) => <Sorry onRetry={retry} />}>
    <App />
  </ErrorBoundary>
</IssueitProvider>;
```

The boundary files the crash with the component stack attached, so you hear about a white screen even when nobody fills in a form. The provider also loads the report widget, whose questions and appearance are set in the dashboard rather than here.

## Reporting from your own code

```tsx
const { report, open } = useIssueit();

await report({ title: "Upload rejected", metadata: { size: file.size } });
open();   // opens the widget's form
```

## Props

| | |
| --- | --- |
| `project` | Required. The project id — public, and safe in a page. |
| `url` | Your Issueit, if you host it. |
| `release` | The build, so minified stacks can be mapped back. |
| `environment` | `production`, `staging`, … |
| `widget` | `false` to use the boundary without loading the widget. |
| `debug` | Log what would be sent and send nothing. |

MIT.
