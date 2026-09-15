// Legacy deployment name; delegates to the canonical ReDream handler.
import { handleAiProcess } from "../_shared/ai-process.ts";

Deno.serve(handleAiProcess);
