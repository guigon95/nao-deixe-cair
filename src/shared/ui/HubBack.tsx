/** Botão discreto para voltar à tela de escolha de jogos. Fica fora da partida em andamento. */
export function HubBack() {
  return (
    <a className="hub-back" href="../" data-ui aria-label="Voltar para a lista de jogos">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Jogos
    </a>
  );
}
