// Resolve a workspace only while both the request and signed-in identity remain current.
export async function resolveActiveAuthDestination<T>({
  userId,
  resolve,
  getCurrentUserId,
  isCurrent,
}: {
  userId: string;
  resolve: () => Promise<T>;
  getCurrentUserId: () => Promise<string | null>;
  isCurrent: () => boolean;
}): Promise<T | null> {
  try {
    if (!isCurrent()) return null;
    const destination = await resolve();
    if (!isCurrent()) return null;
    const currentUserId = await getCurrentUserId();
    return isCurrent() && currentUserId === userId ? destination : null;
  } catch (error) {
    if (!isCurrent()) return null;
    throw error;
  }
}

// Authentication may finish after the sign-in screen or attempt has been replaced.
export async function resolveCurrentAuthentication<T>(authenticate:()=>Promise<T>,isCurrent:()=>boolean):Promise<T|null>{
 try {
  const result=await authenticate();
  return isCurrent()?result:null;
 } catch(error) {
  if(!isCurrent())return null;
  throw error;
 }
}
