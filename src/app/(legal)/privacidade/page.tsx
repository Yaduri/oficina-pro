import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { Contato, Documento, Lista, Secao } from "../texto";

export const metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  return (
    <Documento titulo="Política de privacidade">
      <p>
        Esta política explica como o {LEGAL.servico}{LEGAL.responsavel && `, prestado por ${LEGAL.responsavel},`} trata dados pessoais, conforme a Lei Geral de Proteção de
        Dados (Lei 13.709/2018, LGPD). Ela complementa os{" "}
        <Link href="/termos" className="font-medium text-foreground underline underline-offset-2">
          Termos de uso
        </Link>
        .
      </p>

      <Secao titulo="1. Quem é responsável por quais dados">
        <Lista>
          <li>
            <strong className="font-medium text-foreground">Dados dos usuários do sistema</strong> (dono e equipe da oficina): o{" "}
            {LEGAL.servico} é o controlador.
          </li>
          <li>
            <strong className="font-medium text-foreground">Dados dos clientes da oficina</strong> (pessoas e veículos atendidos): a oficina é
            a controladora e decide o que registrar. O {LEGAL.servico} é operador e trata esses dados apenas para prestar o serviço à oficina.
            Pedidos dos clientes sobre esses dados devem ser feitos à própria oficina.
          </li>
        </Lista>
      </Secao>

      <Secao titulo="2. Dados tratados">
        <p>Dos usuários do sistema:</p>
        <Lista>
          <li>nome, e-mail e dados de login (inclusive quando a entrada é feita pela conta Google);</li>
          <li>oficina a que pertence, papel e registros das ações feitas no sistema (quem criou ou alterou uma OS, por exemplo);</li>
          <li>dados da oficina: razão social, CNPJ, endereço, contatos, logo e dados fiscais.</li>
        </Lista>
        <p>Dos clientes da oficina, conforme o que a oficina cadastrar:</p>
        <Lista>
          <li>nome, CPF ou CNPJ, telefone, e-mail, endereço e data de nascimento;</li>
          <li>dados do veículo: placa, modelo, quilometragem, fotos e condições registradas no check-in;</li>
          <li>assinatura feita na tela, aprovação ou recusa de orçamentos e o nome de quem respondeu;</li>
          <li>serviços, valores, pagamentos e documentos emitidos;</li>
          <li>consentimento para contato por WhatsApp.</li>
        </Lista>
      </Secao>

      <Secao titulo="3. Para que usamos">
        <Lista>
          <li>prestar o serviço contratado e manter a conta funcionando (execução de contrato);</li>
          <li>gerar documentos, orçamentos e registros financeiros e fiscais da oficina (execução de contrato e obrigação legal);</li>
          <li>proteger o sistema contra acessos indevidos e fraudes (legítimo interesse);</li>
          <li>falar com o usuário sobre a conta, avisos e mudanças no serviço (execução de contrato).</li>
        </Lista>
        <p>Não vendemos dados pessoais e não os usamos para publicidade.</p>
      </Secao>

      <Secao titulo="4. Com quem compartilhamos">
        <p>Somente com fornecedores necessários para o funcionamento do serviço, que tratam os dados conforme nossas instruções:</p>
        <Lista>
          <li>Clerk: login e gestão de sessões;</li>
          <li>Supabase: banco de dados;</li>
          <li>Cloudflare: hospedagem e armazenamento de fotos e documentos;</li>
          <li>provedor de emissão de notas fiscais, quando a oficina emitir notas pelo sistema;</li>
          <li>autoridades, quando houver obrigação legal ou ordem judicial.</li>
        </Lista>
        <p>
          Alguns desses fornecedores guardam dados fora do Brasil. Nesses casos, a transferência segue o que a LGPD permite, com contratos que
          exigem proteção equivalente.
        </p>
      </Secao>

      <Secao titulo="5. Links enviados aos clientes">
        <p>
          Orçamentos e documentos podem ser enviados ao cliente por um link com código difícil de adivinhar. Quem tiver o link consegue ver o
          conteúdo, por isso ele deve ser enviado só ao destinatário.
        </p>
      </Secao>

      <Secao titulo="6. Cookies e dados no aparelho">
        <p>
          Usamos apenas cookies necessários para manter a sessão de login. No celular, o sistema pode guardar no próprio aparelho um rascunho do
          check-in em andamento, para não perder as fotos se a internet cair; o rascunho é apagado quando o check-in é enviado. Não usamos
          cookies de publicidade.
        </p>
      </Secao>

      <Secao titulo="7. Por quanto tempo guardamos">
        <p>
          Os dados ficam guardados enquanto a conta estiver ativa. Depois do cancelamento, ficam disponíveis por 30 dias para exportação e então
          são apagados, exceto o que a lei obriga a manter, como documentos fiscais (pelo menos 5 anos) e registros de acesso (6 meses, pelo
          Marco Civil da Internet).
        </p>
      </Secao>

      <Secao titulo="8. Segurança">
        <p>
          O acesso é feito por conexão criptografada (HTTPS), os dados de cada oficina ficam separados das demais, cada usuário só vê o que o seu
          papel permite e os arquivos não ficam em endereços públicos. Nenhum sistema é totalmente imune a falhas; se houver um incidente que
          possa causar risco aos titulares, avisaremos a oficina e a Autoridade Nacional de Proteção de Dados (ANPD) nos prazos legais.
        </p>
      </Secao>

      <Secao titulo="9. Seus direitos">
        <p>
          Pela LGPD, você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão de dados
          desnecessários, portabilidade, informação sobre compartilhamento e revisão do consentimento. Também pode reclamar à ANPD.
        </p>
        <p>
          Usuários do sistema podem fazer esses pedidos <Contato />. Clientes de uma oficina devem procurar a própria oficina, que é quem decide
          sobre esses dados; se ela não responder, você pode nos procurar pelo mesmo canal.
        </p>
      </Secao>

      <Secao titulo="10. Mudanças nesta política">
        <p>
          Podemos atualizar esta política. Mudanças relevantes são avisadas no sistema ou por e-mail, e a data no topo mostra a versão em
          vigor.
        </p>
      </Secao>
    </Documento>
  );
}
