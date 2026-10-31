// Error thrown for every failed API request (live or preview). Fields mirror the backend ApiError contract.
export class ApiError extends Error {
  constructor(code, message, status = 400, fields = [], request_id = 'preview', retry_after = null) {
    super(message); this.name = 'ApiError'; this.code = code; this.status = status;
    this.fields = fields; this.request_id = request_id; this.retry_after = retry_after;
  }
}
