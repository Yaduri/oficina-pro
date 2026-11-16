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
  const { oficina, empresas, papel, userId } = await exigir("usuarios");
  const [membros, convites, base] = await Promise.all([listarMembros(oficina.id), convitesPendentes(oficina.id), urlBase()]);

  const papeis = ORDEM_PAPEIS.filter((p) => podeGerenciarPapel(papel, p));
  const podeTodas = empresas.length === oficina.empresas.length;
  const opcoesEmpresas = empresas.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo }));
  const nomeEmpresa = new Map(oficina.empresas.map((e) => [e.id, e.nome]));
  const textoEmpresas = (todas: boolean, ids: string[]) =>
    todas ? "Todas as empresas" : ids.map((id) => nomeEmpresa.get(id)).filter(Boolean).join(", ") || "Nenhuma empresa";

  return (
    <>
      <PageHeader title="Configurações" description="Quem acessa a oficina, com qual papel e em quais empresas (CNPJs)." />
      <AbasConfig />

      <div className="flex flex-col gap-3">
        <ConvidarForm papeis={papeis} empresas={opcoesEmpresas} podeTodas={podeTodas} />
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
                    empresasTexto={textoEmpresas(c.todasEmpresas, c.empresaIds)}
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
                  empresas={opcoesEmpresas}
                  podeTodas={podeTodas}
                  empresasTexto={textoEmpresas(m.todasEmpresas, m.empresaIds)}
                />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
