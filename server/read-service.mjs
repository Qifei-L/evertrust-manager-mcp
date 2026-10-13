import worker, { configureManagerApi } from '../worker/index.js';

// Reads and gateway connection management have no dependency on the write executor.
export class ReadService {
  constructor(config, bucket, monitor) {
    this.config = config;
    this.bucket = bucket;
    this.monitor = monitor;
    configureManagerApi(config.managerBase, (...args) => monitor.managerFetch(...args));
  }
  fetch(request) {
    return worker.fetch(request, { BUCKET: this.monitor.bucket(this.bucket), PERFORMANCE: this.monitor, MANAGER_TOKEN_ENCRYPTION_KEY: this.config.key });
  }
}
