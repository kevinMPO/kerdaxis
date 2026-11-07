import AuthCard from "../login/AuthCard";

export const metadata = { title: "Sign in · Kerdaxis" };

export default async function SigninPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthCard
      mode="signin"
      notice={sp.payment === "pending" ? "We couldn't confirm the payment yet. Sign in to check again, or continue to payment." : undefined}
    />
  );
}
