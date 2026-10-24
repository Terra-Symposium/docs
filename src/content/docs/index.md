---
title: Terra Docs
description: Install an independent document editor and viewer in your own application.
---

Terra Docs is a reusable React editor and viewer. Each installation is a host application: it owns documents, storage, authentication, and access rules, while the Docs component edits and renders the document value.

## Install an instance

Create a separate application from the [getting started guide](/getting-started/). Instances can use local state for a prototype or connect their own persistence provider.

## Current release scope

The current package supports Portable Text paragraphs, headings 2–6, quotes, bold, italic, underline, strikethrough, and links. The included playground is an in-memory demo. It does not yet open or save Markdown files, upload assets, or persist documents across reloads.
