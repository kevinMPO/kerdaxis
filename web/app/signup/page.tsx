import AuthCard from "../login/AuthCard";

export const metadata = { title: "Create your Kerdaxis account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const sp = await searchParams;
  return <AuthCard mode="signup" notice={sp.canceled ? "Payment canceled. Your account is saved: continue whenever you like." : undefined} />;
}
