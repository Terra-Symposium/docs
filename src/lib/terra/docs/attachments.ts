/** Attachment categories and the shared active filter. */
import { atom } from 'nanostores';
import type { AttchType } from '../runtime/types.js';

export const ATTCH_TYPES = ['document', 'image', 'youtube', 'website', 'tsdocs', 'other'] as const;
export const $attachmentFilter = atom<AttchType[]>([...ATTCH_TYPES]);
