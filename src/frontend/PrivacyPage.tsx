import { useEffect } from "react";
import { Brand } from "@/components/Brand";
import { contactUrl } from "@/lib/content";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Política de privacidade | Nexo";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      "Como a Nexo trata dados pessoais e usa cookies neste site, conforme a LGPD.",
    );
  }, []);
  return (
    <>
      <header className="nx-header">
        <div className="nx-wrap nx-header-inner">
          <a href="/" aria-label="Nexo: página inicial"><Brand /></a>
        </div>
      </header>
      <main className="nx-wrap legal">
        <h1>Política de privacidade</h1>
        <p className="legal-updated">Atualizada em 26 de outubro de 2026.</p>

        <h2>Quem somos</h2>
        <p>
          A Nexo desenvolve agentes de inteligência artificial e automações para empresas e escritórios de
          contabilidade. Esta política explica quais dados pessoais tratamos quando você visita este site ou fala
          conosco, e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>

        <h2>Quais dados tratamos</h2>
        <ul>
          <li>
            <strong>Conversa pelo WhatsApp.</strong> Quando você clica para falar conosco, a conversa acontece no
            WhatsApp. Recebemos o seu número, o seu nome de perfil e o que você escrever. Usamos isso para responder
            e para tratar do seu pedido.
          </li>
          <li>
            <strong>Origem da visita.</strong> Se você chegou por um anúncio, a mensagem do WhatsApp pode trazer
            uma marca de origem, por exemplo &quot;google-ads&quot;. Ela só diz de onde você veio.
          </li>
          <li>
            <strong>Dados de medição (só com a sua permissão).</strong> Se você aceitar os cookies, o Google
            registra dados de uso da página, como páginas vistas, cliques no botão do WhatsApp, tipo de aparelho,
            localização aproximada e se a visita veio de um anúncio.
          </li>
        </ul>

        <h2>Para que usamos</h2>
        <ul>
          <li>Responder a você e apresentar a nossa solução (execução de procedimentos preliminares a um contrato).</li>
          <li>Medir quais anúncios e páginas trazem contatos, para melhorar o site e investir melhor (consentimento).</li>
          <li>Cumprir obrigações legais e proteger nossos direitos (obrigação legal e exercício regular de direitos).</li>
        </ul>

        <h2>Cookies</h2>
        <p>
          Não usamos cookies de medição ou de publicidade sem a sua escolha. Ao abrir o site pela primeira vez, você
          pode aceitar ou recusar. Se recusar, nada do Google é carregado. Você pode mudar de ideia a qualquer
          momento no botão &quot;Preferências de cookies&quot; do rodapé, ou apagando os dados do site no seu
          navegador. Se você aceitar, o Google pode definir cookies como <code>_ga</code>, <code>_gcl_au</code> e{" "}
          <code>_gcl_aw</code>, usados para medição e para saber se um anúncio levou a um contato.
        </p>

        <h2>Com quem compartilhamos</h2>
        <p>
          Os dados de medição são tratados pelo Google (Google Ads e Google Analytics), que pode armazená-los em
          servidores fora do Brasil. A conversa pelo WhatsApp é tratada também pela Meta, conforme os termos do
          aplicativo. Não vendemos dados pessoais.
        </p>

        <h2>Por quanto tempo guardamos</h2>
        <p>
          Guardamos o histórico de contato enquanto houver conversa ou relação comercial, e pelo prazo necessário
          para cumprir obrigações legais. Os dados de medição seguem os prazos configurados no Google, e você pode
          pedir a exclusão antes disso.
        </p>

        <h2>Seus direitos</h2>
        <p>
          Você pode pedir a confirmação de que tratamos seus dados, o acesso, a correção, a anonimização ou a
          exclusão, a portabilidade, informação sobre com quem compartilhamos e a revogação do consentimento, a
          qualquer momento. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>

        <h2>Como falar com a gente sobre seus dados</h2>
        <p>
          Envie o seu pedido pelo nosso <a href={contactUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>,
          informando que é sobre privacidade. Respondemos no prazo da lei.
        </p>

        <h2>Mudanças nesta política</h2>
        <p>Se algo mudar, atualizamos esta página e a data no início.</p>

        <p style={{ marginTop: "2.5rem" }}>
          <a href="/">Voltar ao site</a>
        </p>
      </main>
    </>
  );
}
