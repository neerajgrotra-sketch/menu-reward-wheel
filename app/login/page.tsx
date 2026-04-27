export default function LoginRedirect() {
  if (typeof window !== 'undefined') {
    window.location.href = '/auth';
  }
  return null;
}
