import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Entrar" };

export default function Page() {
  return <SignIn />;
}
