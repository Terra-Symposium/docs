/** Navigation data accepted by the React convenience adapter for static Docs sites. */
export type DocsAttachment = { title: string; href: string; type?: string; size?: number };
export type DocsLeaf = {
  id?: string;
  path?: string;
  title: string;
  href: string;
  description?: string;
  updatedAt?: string;
  attachments?: DocsAttachment[];
};
export type DocsGroup = { title: string; id?: string; path?: string; leaves: DocsLeaf[] };
export type DocsSection = { title: string; id?: string; path?: string; groups: DocsGroup[] };
