import type { Issue } from '@gen/shared';

export type RepoErrorCode =
  | 'not_authenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  /** Є попередження — потрібне підтвердження користувача (повторний виклик з confirm: true) */
  | 'needs_confirmation'
  | 'conflict_state';

export class RepoError extends Error {
  constructor(
    public code: RepoErrorCode,
    message: string,
    public issues: Issue[] = [],
  ) {
    super(message);
    this.name = 'RepoError';
  }
}
