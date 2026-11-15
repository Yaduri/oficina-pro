import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Criar conta" };

export default function Page() {
  return <SignUp />;
}
