import type { Attachment } from './types';

export type AttachmentRole = NonNullable<Attachment['role']>;

/** Only an explicit question role may reveal an image before answering. */
export function attachmentRole(attachment: Attachment): AttachmentRole {
  return attachment.role === 'question' ? 'question' : 'explanation';
}

export function attachmentsForRole(attachments: readonly Attachment[], role: AttachmentRole): Attachment[] {
  return attachments.filter((attachment) => attachmentRole(attachment) === role);
}
