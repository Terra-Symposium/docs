---
title: Terra Docs
description: Install an independent document editor and viewer in your own application.
---

Terra Docs is a reusable React editor and viewer. Each installation is a host application: it owns documents, storage, authentication, and access rules, while the Docs component edits and renders the document value.

## Install an instance

Create a separate application from the [getting started guide](/getting-started/). Instances can use local state for a prototype or connect their own persistence provider.

## Current release scope

The package supports Portable Text text and the reusable rich blocks listed in the [component reference](/component/). Repository-backed instances can render Markdown and adjacent assets. Remote instances can add draft saving, publishing, history, and uploads through a host-provided storage adapter. The host supplies authentication and permissions.
