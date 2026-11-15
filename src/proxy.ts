import { clerkMiddleware } from "@clerk/nextjs/server";

// O proxy só disponibiliza a sessão do Clerk. A proteção de cada tela é feita no servidor,
// na própria página/layout (getContexto() redireciona para o login), como recomenda o Clerk.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
