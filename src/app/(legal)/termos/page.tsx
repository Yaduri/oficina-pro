import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { Contato, Documento, Lista, Secao } from "../texto";

export const metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <Documento titulo="Termos de uso">
      <p>
        Estes termos regem o uso do {LEGAL.servico}, sistema de gestão para oficinas mecânicas{LEGAL.responsavel && ` prestado por ${LEGAL.responsavel}`}. Ao criar uma
        conta ou aceitar um convite, você concorda com eles e com a{" "}
        <Link href="/privacidade" className="font-medium text-foreground underline underline-offset-2">
          Política de privacidade
        </Link>
        .
      </p>

      <Secao titulo="1. O serviço">
        <p>
          O {LEGAL.servico} permite registrar check-ins de veículos, ordens de serviço, orçamentos, agenda, clientes, financeiro e documentos
          da oficina, pelo navegador ou instalado no celular. As funções disponíveis podem mudar com o tempo; mudanças relevantes são avisadas
          com antecedência.
        </p>
      </Secao>

      <Secao titulo="2. Conta e usuários">
        <Lista>
          <li>Cada conta corresponde a uma oficina, identificada por um CNPJ. O mesmo CNPJ não pode ter duas contas.</li>
          <li>
            Quem cria a conta é o dono e pode convidar outras pessoas da equipe, definindo o papel de cada uma. Cada login pertence a uma única
            oficina.
          </li>
          <li>
            Cada pessoa é responsável por manter a senha em sigilo. A oficina responde pelo que for feito pelos usuários que ela convidou e
            deve desativar o acesso de quem sair da equipe.
          </li>
          <li>Os dados informados no cadastro (nome, CNPJ, endereço, dados fiscais) devem ser verdadeiros e mantidos atualizados.</li>
        </Lista>
      </Secao>

      <Secao titulo="3. Responsabilidades da oficina">
        <Lista>
          <li>
            Os dados de clientes e veículos cadastrados são da oficina. Ela decide o que registrar e deve ter base legal para isso, inclusive o
            consentimento do cliente para contato por WhatsApp quando exigido.
          </li>
          <li>
            Orçamentos, termos de entrada, recibos e outros documentos gerados no sistema são emitidos pela oficina, que responde pelo seu
            conteúdo, pelos valores e pelos serviços prestados aos seus clientes.
          </li>
          <li>
            Links enviados aos clientes (orçamento, documentos) podem ser abertos por qualquer pessoa que os receba. Envie-os apenas ao
            destinatário certo.
          </li>
          <li>
            Informações fiscais e contábeis (regime tributário, taxas, categorias, relatórios) devem ser conferidas com o contador da oficina.
            O sistema não substitui orientação contábil ou jurídica.
          </li>
        </Lista>
      </Secao>

      <Secao titulo="4. Uso permitido">
        <p>Não é permitido:</p>
        <Lista>
          <li>usar o sistema para atividades ilegais ou para enviar mensagens não solicitadas em massa;</li>
          <li>tentar acessar dados de outras oficinas, contornar limites de acesso ou testar a segurança sem autorização;</li>
          <li>enviar arquivos com vírus ou conteúdo que viole direitos de terceiros;</li>
          <li>revender ou copiar o sistema.</li>
        </Lista>
        <p>O descumprimento pode levar à suspensão do acesso.</p>
      </Secao>

      <Secao titulo="5. Preço e pagamento">
        <p>
          Valores, forma de pagamento e período de teste, quando houver, são informados na contratação. Mudanças de preço são avisadas com pelo
          menos 30 dias de antecedência. A falta de pagamento pode levar à suspensão do acesso, sem apagar os dados durante o prazo previsto no
          item 8.
        </p>
      </Secao>

      <Secao titulo="6. Disponibilidade">
        <p>
          O serviço é oferecido pela internet e pode ter interrupções por manutenção, falhas de terceiros (hospedagem, provedores de login,
          internet) ou casos fora do nosso controle. Manutenções programadas são feitas, sempre que possível, fora do horário comercial.
        </p>
      </Secao>

      <Secao titulo="7. Limitação de responsabilidade">
        <p>
          O {LEGAL.servico} não responde por prejuízos causados por dados incorretos informados pelos usuários, por uso indevido de senhas, pela
          relação entre a oficina e seus clientes ou por lucros cessantes. Nos demais casos, a responsabilidade fica limitada ao valor pago
          pela oficina nos 12 meses anteriores ao fato, salvo o que a lei não permitir limitar.
        </p>
      </Secao>

      <Secao titulo="8. Cancelamento e dados">
        <p>
          A oficina pode cancelar a conta a qualquer momento. Depois do cancelamento, os dados ficam disponíveis para exportação por 30 dias e
          então são apagados, exceto o que a lei obriga a guardar por mais tempo (por exemplo, documentos fiscais). Também podemos encerrar uma
          conta que descumpra estes termos, com aviso prévio sempre que possível.
        </p>
      </Secao>

      <Secao titulo="9. Mudanças nestes termos">
        <p>
          Podemos atualizar estes termos. Mudanças relevantes são avisadas no sistema ou por e-mail antes de entrar em vigor. Continuar usando o
          serviço depois disso significa concordar com a nova versão.
        </p>
      </Secao>

      <Secao titulo="10. Contato e foro">
        <p>
          Dúvidas sobre estes termos podem ser enviadas <Contato />. Estes termos seguem as leis brasileiras
          {LEGAL.foro ? `, e fica eleito o foro da comarca de ${LEGAL.foro} para resolver qualquer questão` : ""}.
        </p>
      </Secao>
    </Documento>
  );
}
