import { Card, PageHeader, Vazio } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { ORDEM_PAPEIS, podeGerenciarPapel } from "@/lib/permissoes";
import { convitesPendentes, listarMembros } from "@/lib/usuarios";
import { urlBase } from "@/lib/orcamento";
import { formatData } from "@/lib/utils";
import { AbasConfig } from "../abas";
import { ConvidarForm, ConvitePendente, MembroLinha } from "./forms";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const { oficina, papel, userId } = await exigir("usuarios");
  const [membros, convites, base] = await Promise.all([listarMembros(oficina.id), convitesPendentes(oficina.id), urlBase()]);

  const papeis = ORDEM_PAPEIS.filter((p) => podeGerenciarPapel(papel, p));

  return (
    <>
      <PageHeader title="Configurações" />
      <AbasConfig />

      <div className="flex flex-col gap-3">
        <ConvidarForm papeis={papeis} />
      </div>

      {convites.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">
            Convites pendentes <span className="font-normal text-muted">{convites.length}</span>
          </h2>
          <Card>
            <ul className="divide-y divide-border">
              {convites.map((c) => {
                const url = `${base}/convite/${c.token}`;
                const texto = `Olá, ${c.nome.split(" ")[0]}! Este é o seu convite para acessar o sistema da ${oficina.nome}: ${url}`;
                return (
                  <ConvitePendente
                    key={c.id}
                    id={c.id}
                    nome={c.nome}
                    papel={c.papel}
                    expira={formatData(c.expiraEm)}
                    url={url}
                    whatsapp={`https://wa.me/?text=${encodeURIComponent(texto)}`}
                    podeCancelar={podeGerenciarPapel(papel, c.papel)}
                  />
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">
          Usuários <span className="font-normal text-muted">{membros.filter((m) => m.ativo).length}</span>
        </h2>
        <Card>
          {membros.length === 0 ? (
            <Vazio titulo="Nenhum usuário" />
          ) : (
            <ul className="divide-y divide-border">
              {membros.map((m) => (
                <MembroLinha
                  key={m.id}
                  membro={m}
                  voce={m.clerkUserId === userId}
                  editavel={m.clerkUserId !== userId && podeGerenciarPapel(papel, m.papel)}
                  papeis={papeis}
                />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
