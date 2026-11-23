import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { getDbSistema, schema } from "@/db";
import { Brand } from "@/components/brand";
import { buttonClass } from "@/components/ui";
import { PAPEIS } from "@/lib/permissoes";
import { conviteDoToken, situacaoConvite } from "@/lib/usuarios";
import { formatData } from "@/lib/utils";
import { Aceitar } from "./aceitar";

export const metadata: Metadata = { title: "Convite", robots: { index: false, follow: false } };

export default async function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const dados = await conviteDoToken(token);
  if (!dados) notFound();
  const { convite, oficina } = dados;
  const situacao = situacaoConvite(convite);
  const { userId } = await auth();
  const voltar = encodeURIComponent(`/convite/${token}`);

  // Já participa desta oficina? (Um mesmo login pode participar de várias oficinas.)
  let jaMembro = false;
  if (userId) {
    const db = await getDbSistema();
    const [m] = await db
      .select({ id: schema.membros.id })
      .from(schema.membros)
      .where(and(eq(schema.membros.oficinaId, oficina.id), eq(schema.membros.clerkUserId, userId), eq(schema.membros.ativo, true)))
      .limit(1);
    jaMembro = !!m;
  }

  return (
    <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-14 sm:py-10">
      <Brand />
      <main className="m-auto w-full max-w-[460px] py-10">
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-pop sm:p-8">
          {situacao !== "valido" && !jaMembro ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">
                {situacao === "aceito" ? "Convite já usado" : situacao === "cancelado" ? "Convite cancelado" : "Convite vencido"}
              </h1>
              <p className="text-muted">
                {situacao === "aceito"
                  ? "Este link já foi usado para entrar na oficina. Se foi você, é só entrar com a sua conta."
                  : `Peça um novo convite para quem administra a ${oficina.nome}.`}
              </p>
              <Link href="/sign-in" className={buttonClass("secondary", "self-start")}>
                Entrar
              </Link>
            </>
          ) : jaMembro ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Você já faz parte da {oficina.nome}</h1>
              <Link href="/inicio" className={buttonClass("primary", "self-start")}>
                Ir para o sistema
              </Link>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-xl font-semibold tracking-tight">Entrar na {oficina.nome}</h1>
                <p className="text-muted">
                  Você foi convidado como <strong className="font-semibold text-foreground">{PAPEIS[convite.papel].label}</strong>.
                </p>
                <p className="text-[13px] text-muted">{PAPEIS[convite.papel].descricao}</p>
              </div>

              {userId ? (
                <Aceitar token={token} />
              ) : (
                <div className="flex flex-col gap-2.5">
                  <Link href={`/sign-up?redirect_url=${voltar}`} className={buttonClass("primary", "h-11")}>
                    Criar minha conta
                  </Link>
                  <Link href={`/sign-in?redirect_url=${voltar}`} className={buttonClass("secondary", "h-11")}>
                    Já tenho conta
                  </Link>
                  <p className="text-[13px] text-muted">Depois de entrar, você volta para esta página para aceitar.</p>
                </div>
              )}
              <p className="text-xs text-muted">Convite válido até {formatData(convite.expiraEm)}.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
