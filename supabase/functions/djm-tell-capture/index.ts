// Legacy deployment name; delegates to the canonical ReDream handler.
import { handleAiCapture } from "../_shared/ai-capture.ts";

Deno.serve(handleAiCapture);
