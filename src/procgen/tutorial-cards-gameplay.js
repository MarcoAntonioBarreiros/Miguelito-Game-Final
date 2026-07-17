const page = (title, body, points = []) => ({ title, body, points });
const card = (id, category, title, subtitle, glyph, accent, pages, cycle = [], cycleLabel = 'Ciclo ou etapas') => ({
  id, category, title, subtitle, glyph, accent, pages, cycle, cycleLabel,
});

export const gameplayTutorialCards = {
  'system-welcome': card(
    'system-welcome',
    'Guia didático',
    'Rizosfera Viva',
    'Aprenda enquanto joga',
    '◈',
    '#70e5d6',
    [
      page(
        'Como funcionam os cartões',
        'Na primeira vez em que um organismo, estrutura, processo ou poder importante aparece, o jogo pausa e abre um cartão didático.',
        [
          'A simulação fica completamente pausada durante a leitura.',
          'Use Próximo e Voltar para navegar.',
          'Os cartões descobertos ficam disponíveis na Biblioteca.',
        ],
      ),
      page(
        'Biologia e metáfora',
        'Algumas mecânicas representam processos reais; outras são metáforas de videogame criadas para tornar esses processos jogáveis.',
        [
          'O cartão sempre separa função biológica e função no jogo.',
          'Simplificações e metáforas são indicadas claramente.',
        ],
      ),
    ],
    ['Descoberta', 'Pausa', 'Aprendizagem', 'Retorno ao jogo'],
    'Fluxo do tutorial',
  ),

  'action-exudate': card(
    'action-exudate',
    'Ação',
    'Exsudato radicular',
    'Carbono e sinais liberados na rizosfera',
    'C',
    '#b7f36b',
    [
      page(
        'O que é?',
        'Exsudatos são compostos liberados pelas raízes, como açúcares, aminoácidos, ácidos orgânicos e moléculas sinalizadoras.',
      ),
      page(
        'Função biológica',
        'Eles alimentam e selecionam microrganismos da rizosfera, alteram nutrientes e participam da comunicação entre raiz e microbiota.',
        [
          'Podem favorecer organismos benéficos.',
          'Também podem atrair patógenos, como juvenis de nematoides.',
        ],
      ),
      page(
        'Função no jogo',
        'Pressione E para liberar um exsudato. Ele recruta microrganismos, sustenta colônias e orienta algumas estruturas.',
      ),
      page(
        'Como usar',
        'Libere exsudatos perto do organismo que deseja recrutar ou junto de uma colônia que esteja perdendo vigor. Evite desperdiçá-los em raízes desprotegidas durante uma infestação.',
      ),
    ],
    ['Liberação pela raiz', 'Difusão no solo', 'Atração microbiana', 'Consumo'],
    'Destino do exsudato',
  ),

  'action-inoculation': card(
    'action-inoculation',
    'Ação',
    'Inoculação',
    'Levar um microrganismo ao local onde sua função é necessária',
    'E',
    '#8debdc',
    [
      page(
        'O que significa?',
        'Inocular é introduzir deliberadamente um microrganismo em um ambiente, superfície ou hospedeiro.',
      ),
      page(
        'Função no jogo',
        'Depois de recrutar um organismo, leve-o até a raiz ou plataforma desejada e pressione E. A função resultante depende da espécie e do local.',
        [
          'Rhizobium precisa de uma raiz compatível para formar nódulos.',
          'Bacillus forma biofilmes protetores.',
          'Pseudomonas explora ferro e compete com patógenos.',
          'Trichoderma cresce em direção a alvos expostos.',
        ],
      ),
      page(
        'Decisão estratégica',
        'O melhor local depende da ameaça presente. Proteger uma raiz antes da infecção costuma ser mais eficiente do que recuperá-la depois.',
      ),
    ],
    ['Recrutamento', 'Transporte', 'Inoculação', 'Colonização'],
    'Etapas no jogo',
  ),

  'power-double-jump': card(
    'power-double-jump',
    'Poder',
    'Salto duplo',
    'Nova possibilidade de movimentação',
    '↑↑',
    '#72e8dd',
    [
      page('Função no jogo', 'O segundo salto permite corrigir a trajetória no ar e alcançar raízes mais altas.'),
      page(
        'Relação com a biologia',
        'Este é um recurso de plataforma, não um processo biológico literal. Ele simboliza novas possibilidades de exploração quando a arquitetura radicular melhora.',
      ),
      page('Como usar', 'Pressione o botão de pulo novamente enquanto Miguelito estiver no ar.'),
    ],
    ['Primeiro salto', 'Correção no ar', 'Segundo impulso', 'Aterrissagem'],
    'Sequência de uso',
  ),

  'power-dash': card(
    'power-dash',
    'Poder',
    'Dash',
    'Impulso rápido para atravessar riscos',
    '≫',
    '#6ce7df',
    [
      page('Função no jogo', 'O dash produz um deslocamento horizontal rápido, útil para vencer vãos e escapar de ataques.'),
      page(
        'Relação com a biologia',
        'É uma mecânica de videogame. No contexto didático, representa a maior capacidade de deslocamento proporcionada por um sistema radicular funcional.',
      ),
      page(
        'Limitações',
        'Contaminação fúngica intensa ou dois juvenis J2 transportados podem bloquear o dash temporariamente.',
      ),
    ],
    ['Preparação', 'Impulso', 'Travessia', 'Recarga'],
    'Sequência de uso',
  ),

  'power-pulse': card(
    'power-pulse',
    'Poder',
    'Pulso mineral',
    'Ação direta de curto alcance',
    '✦',
    '#ffb15c',
    [
      page(
        'Função no jogo',
        'O pulso rompe cristais minerais, reduz contaminação aderida, remove J2 transportados e interrompe certos patógenos.',
      ),
      page(
        'Relação com a biologia',
        'O pulso é uma simplificação fictícia. Plantas não emitem uma onda instantânea com todos esses efeitos. A mecânica reúne respostas químicas e intervenções de manejo em uma ação jogável.',
      ),
      page(
        'Como usar',
        'Use perto do alvo. Rhizoctonia exige vários pulsos; controles biológicos bem estabelecidos podem ser mais eficientes.',
      ),
    ],
    ['Acionamento', 'Expansão', 'Interação com alvos', 'Recarga'],
    'Etapas no jogo',
  ),

  'process-root-health': card(
    'process-root-health',
    'Sistema de jogo',
    'Saúde da raiz',
    'O principal objetivo ecológico da fase',
    '♥',
    '#ffd36f',
    [
      page(
        'Quatro estados',
        'Cada raiz pode estar saudável, estressada, comprometida ou em colapso.',
        [
          'Saudável: 75–100%.',
          'Estressada: 50–74%.',
          'Comprometida: 25–49%.',
          'Em colapso: abaixo de 25%.',
        ],
      ),
      page('O que reduz a saúde?', 'Meloidogyne, Rhizoctonia, Ralstonia e outras pressões aumentam o dano.'),
      page('O que ajuda?', 'Nódulos ativos, arbúsculos micorrízicos e biofilmes maduros favorecem recuperação e sustentação.'),
      page(
        'Duas barras',
        'A barra inferior mostra a saúde atual. A superior mostra o máximo recuperável, que pode ser reduzido permanentemente por galhas maduras.',
      ),
    ],
    ['Saudável', 'Estressada', 'Comprometida', 'Colapso', 'Recuperação parcial'],
    'Estados possíveis',
  ),

  'process-root-recovery': card(
    'process-root-recovery',
    'Processo',
    'Recuperação radicular',
    'Restauração gradual de função e sustentação',
    '↟',
    '#9bea8f',
    [
      page(
        'Como reconhecer',
        'Fluxos verde-dourados, reaparecimento de pelos e contorno verde indicam que a raiz está recuperando saúde.',
      ),
      page(
        'Mecanismos no jogo',
        'Nódulos fornecem suporte metabólico; micorriza melhora absorção e sustentação; biofilmes reduzem novas agressões.',
      ),
      page(
        'Limites',
        'A recuperação não ultrapassa a saúde máxima reduzida por galhas. Murcha vascular avançada também bloqueia grande parte da recuperação.',
      ),
      page('Objetivo', 'Controle os patógenos e mantenha a comunidade benéfica ativa antes de seguir para a raiz principal.'),
    ],
    ['Controle da pressão', 'Retorno do fluxo', 'Reparo parcial', 'Nova estabilidade'],
  ),

  'process-root-collapse': card(
    'process-root-collapse',
    'Efeito',
    'Perda de sustentação',
    'Raiz criticamente comprometida',
    '⌄',
    '#ff657f',
    [
      page(
        'O que acontece?',
        'A raiz afunda, oscila e pode ceder temporariamente sob Miguelito quando a integridade estrutural fica muito baixa.',
      ),
      page(
        'Base biológica',
        'Doenças radiculares reduzem função, resistência e continuidade dos tecidos. O cedimento como plataforma é uma metáfora visual desse prejuízo.',
      ),
      page('Consequência no jogo', 'O apoio pode desaparecer por alguns instantes, aumentando o risco de queda.'),
      page('Como reduzir o risco', 'Controle a causa do dano e estabeleça micorriza madura, que aumenta a estabilidade.'),
    ],
    ['Dano acumulado', 'Perda de integridade', 'Afundamento', 'Cedimento', 'Recuperação ou falha'],
  ),
};
