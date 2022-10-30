import fs from 'fs';

import { Task } from '@stryker-mutator/util';
import { mergeMap, Subject } from 'rxjs';
import { Disposable } from 'typed-inject';

const MAX_CONCURRENT_FILE_IO = 256;

class FileSystemAction<TOut> {
  public readonly task = new Task<TOut>();

  /**
   * @param work The task, where a resource and input is presented
   */
  constructor(private readonly work: () => Promise<TOut>) {}

  public async execute() {
    try {
      const output = await this.work();
      this.task.resolve(output);
    } catch (err) {
      this.task.reject(err);
    }
  }
}

/**
 * A wrapper around nodejs's 'fs' core module, for dependency injection purposes.
 *
 * Also has but with build-in buffering with a concurrency limit (like graceful-fs).
 */
export class CleanupFileSystem implements Disposable {
  private readonly todoSubject = new Subject<FileSystemAction<any>>();
  private readonly subscription = this.todoSubject
    .pipe(
      mergeMap(async (action) => {
        await action.execute();
      }, MAX_CONCURRENT_FILE_IO)
    )
    .subscribe();

  public dispose(): void {
    this.subscription.unsubscribe();
  }

  public readonly rm = this.forward('rm');

  private forward<TMethod extends keyof Omit<typeof fs.promises, 'constants'>>(method: TMethod): typeof fs.promises[TMethod] {
    return (...args: any[]) => {
      const action = new FileSystemAction(() => (fs.promises[method] as any)(...args));
      this.todoSubject.next(action);
      return action.task.promise as any;
    };
  }
}
