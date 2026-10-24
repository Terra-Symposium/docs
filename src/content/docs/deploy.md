---
title: Deploy an instance
description: Build and deploy the host application.
---

Terra Docs is a client-side React component. Deploy the host app using its framework's normal build and hosting workflow.

For the Vite starter created in [Create an instance](/getting-started/):

```sh
pnpm build
```

Publish the generated `dist/` directory with your static host. If your host uses server-side rendering, follow its React client-component requirements. Configure document APIs and credentials in the host's deployment environment; never put secrets in browser code.

Persistence, authorization, and backups are supplied by the host application.
