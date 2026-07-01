/**
 * Format a duration in milliseconds to a human-readable string.
 * Useful for task metadata and logging.
 *
 * @example formatDuration(125400) => "2m 5s"
 * @example formatDuration(500) => "500ms"
 * @example formatDuration(3661000) => "1h 1m 1s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60_000) % 60;
  const hours = Math.floor(ms / 3_600_000);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(" ") || "0ms";
}

/**
 * Truncate a string to a maximum length, appending ellipsis if truncated.
 * Useful for task metadata which has size limits.
 *
 * @example truncate("hello world", 5) => "he..."
 * @example truncate("hi", 10) => "hi"
 */
export function truncate(str: string, maxLength: number): string {
  if (maxLength < 4) return str.slice(0, maxLength);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Create a slug from a string. Useful for generating task IDs and queue names.
 *
 * @example slugify("My Task Name") => "my-task-name"
 * @example slugify("hello_world 123!") => "hello-world-123"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
