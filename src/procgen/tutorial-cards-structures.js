const page = (title, body, points = []) => ({ title, body, points });
const card = (id, category, title, subtitle, glyph, accent, pages, cycle = [], cycleLabel = 'Ciclo ou etapas') => ({
  id, category, title, subtitle, glyph, accent, pages, cycle, cycleLabel,
});

export const structureTutorialCards = {
  'structure-nodule': card(
    'structure-nodule',
    'Estrutura biológica',
    'Nódulo radicular',
    'Órgão simbiótico formado pela planta',
    'Nod',
    '#ff9db5',
    [
      page('O que é?', 'O nódulo é um órgão novo formado na raiz durante a simbiose entre uma leguminosa e bactérias compatíveis.'),
      page(
        'Função biológica',
        'Ele abriga bacteroides e mantém condições adequadas para a nitrogenase. A planta fornece carbono e recebe nitrogênio assimilável.',
      ),
      page('Função no jogo', 'Nódulos ativos aumentam Solo e Esperança e aceleram a recuperação da raiz.'),
      page('Limitação', 'Sem carbono ou com transporte vascular reduzido, o nódulo pode ficar inativo mesmo depois de maduro.'),
    ],
    ['Reconhecimento', 'Fio de infecção', 'Primórdio', 'Nódulo jovem', 'Nódulo ativo'],
    'Formação',
  ),

  'process-fbn': card(
    'process-fbn',
    'Processo',
    'Fixação biológica de nitrogênio',
    'Conversão de N₂ em formas aproveitáveis',
    'N₂→NH₃',
    '#ffd783',
    [
      page('O que é?', 'A fixação biológica de nitrogênio é realizada por microrganismos que possuem o complexo nitrogenase.'),
      page(
        'No nódulo',
        'A nitrogenase exige muita energia e é sensível ao oxigênio. A leghemoglobina ajuda a controlar a disponibilidade de O₂.',
      ),
      page('Função no jogo', 'A FBN aumenta continuamente Solo e Esperança, melhora a recuperação e contribui para a pontuação da fase.'),
      page('Dependências', 'Carbono, compatibilidade, saúde da raiz e transporte vascular determinam a atividade do nódulo.'),
    ],
    ['N₂ atmosférico', 'Nitrogenase', 'NH₃/NH₄⁺', 'Assimilação pela planta'],
    'Transformação',
  ),

  'structure-biofilm': card(
    'structure-biofilm',
    'Estrutura biológica',
    'Biofilme',
    'Comunidade aderida em matriz extracelular',
    'Bio',
    '#70e5d6',
    [
      page('O que é?', 'Um biofilme é uma comunidade de células aderidas a uma superfície e envolvidas por uma matriz produzida pelos próprios microrganismos.'),
      page('Função biológica', 'A matriz favorece permanência, comunicação e resistência a variações ambientais.'),
      page('Função no jogo', 'Biofilmes de Bacillus protegem a raiz, repelem J2, reduzem patógenos e funcionam como checkpoints.'),
      page('Manutenção', 'A proteção aumenta com a maturidade e cai quando a colônia perde carbono e esporula.'),
    ],
    ['Adesão', 'Microcolônia', 'Matriz', 'Biofilme maduro', 'Dispersão ou esporulação'],
  ),

  'process-siderophore': card(
    'process-siderophore',
    'Processo',
    'Sideróforo',
    'Molécula de alta afinidade por ferro',
    'Fe³⁺',
    '#b9f36f',
    [
      page('O que é?', 'Sideróforos são moléculas secretadas para capturar ferro quando ele está pouco disponível.'),
      page(
        'Função ecológica',
        'A captura beneficia o produtor e altera a competição. O efeito sobre outros organismos depende de sua capacidade de utilizar o complexo ferro-sideróforo.',
      ),
      page('Função no jogo', 'Sideróforos saem da Pseudomonas, encontram Fe³⁺ e retornam à colônia. A reserva enfraquece patógenos próximos.'),
      page(
        'Atenção didática',
        'Ferro é essencial para plantas e microrganismos. O objetivo não é eliminar o ferro, mas representar a competição por sua disponibilidade.',
      ),
    ],
    ['Secreção', 'Busca', 'Quelagem de Fe³⁺', 'Retorno', 'Utilização'],
  ),

  'structure-arbuscule': card(
    'structure-arbuscule',
    'Estrutura biológica',
    'Arbúsculo',
    'Interface microscópica de troca na micorriza',
    'AM',
    '#d6afff',
    [
      page('O que é?', 'O arbúsculo é uma estrutura hifal muito ramificada formada dentro de células do córtex radicular.'),
      page(
        'Função biológica',
        'Sua grande área de contato favorece a troca de nutrientes entre fungo e planta, sem romper a membrana plasmática da célula hospedeira.',
      ),
      page('Função no jogo', 'Arbúsculos maduros aceleram a recuperação e aumentam a sustentação das raízes.'),
      page('Dinâmica', 'Arbúsculos são estruturas temporárias: formam-se, funcionam e depois são renovados.'),
    ],
    ['Penetração cortical', 'Ramificação', 'Troca ativa', 'Senescência', 'Renovação'],
  ),

  'structure-mycorrhiza-path': card(
    'structure-mycorrhiza-path',
    'Estrutura de jogo',
    'Ponte ou escada micorrízica',
    'Rede hifal transformada em caminho',
    '⌁',
    '#d6afff',
    [
      page('Função no jogo', 'Exsudatos liberados nas bordas podem orientar a formação de uma ponte ou escada que se torna atravessável quando madura.'),
      page('Base biológica', 'A inspiração vem da capacidade das hifas de explorar o solo, conectar regiões e formar redes extensas.'),
      page('Atenção didática', 'A capacidade de sustentar Miguelito é uma metáfora de plataforma, não uma propriedade literal das hifas.'),
      page('Como criar', 'Use exsudato perto da borda de uma raiz quando houver outra plataforma alcançável.'),
    ],
    ['Sinal de exsudato', 'Crescimento orientado', 'Ramificação', 'Feixe maduro', 'Travessia'],
    'Etapas no jogo',
  ),

  'structure-lateral-root': card(
    'structure-lateral-root',
    'Estrutura biológica',
    'Raiz lateral',
    'Nova ramificação do sistema radicular',
    'Y',
    '#d7ba7d',
    [
      page('O que é?', 'Raízes laterais surgem de tecidos internos da raiz e ampliam a arquitetura do sistema radicular.'),
      page('Função biológica', 'Elas aumentam a área de exploração, criam novos pontos de absorção e novas superfícies para interação com microrganismos.'),
      page('Função no jogo', 'Azospirillum e exsudatos orientam o crescimento. Quando madura, a nova raiz passa a sustentar Miguelito.'),
      page('Atenção didática', 'O ritmo acelerado e o uso como plataforma são simplificações para tornar o processo observável e jogável.'),
    ],
    ['Sinalização', 'Primórdio', 'Emergência', 'Alongamento', 'Maturação'],
  ),

  'structure-egg-mass': card(
    'structure-egg-mass',
    'Estrutura do patógeno',
    'Massa de ovos de Meloidogyne',
    'Fonte de novos juvenis infectivos',
    '○○',
    '#ffe0a6',
    [
      page('O que é?', 'A fêmea adulta deposita ovos em uma matriz gelatinosa associada à superfície da raiz.'),
      page('Função no ciclo', 'Dentro dos ovos ocorre o desenvolvimento inicial. O J1 sofre muda ainda no ovo, e o J2 infectivo eclode.'),
      page('Função no jogo', 'Cada massa libera vários J2. Trichoderma pode envolver a massa, reduzir a eclosão e inviabilizar os ovos gradualmente.'),
      page('Prioridade', 'Neutralizar a massa evita várias infecções futuras e costuma ser mais eficiente do que perseguir cada J2 separadamente.'),
    ],
    ['Oviposição', 'Embriogênese', 'J1', 'Muda no ovo', 'Eclosão do J2'],
  ),

  'structure-gall': card(
    'structure-gall',
    'Estrutura do patógeno',
    'Galha radicular',
    'Alteração do tecido induzida pelo nematoide',
    '◉',
    '#ff9f8f',
    [
      page('O que é?', 'A galha é o aumento do tecido radicular associado à formação de células gigantes que alimentam o nematoide.'),
      page('Prejuízo biológico', 'A infecção altera fluxo de água e nutrientes, desvia fotoassimilados e pode prejudicar o desenvolvimento da planta.'),
      page('Função no jogo', 'Galhas maduras reduzem permanentemente a saúde máxima da raiz. A penalidade aumenta com a fêmea adulta e a oviposição.'),
      page('Limitação do controle', 'Eliminar J2 externos não remove a galha já formada. A prevenção precoce é essencial.'),
    ],
    ['Penetração', 'Células gigantes', 'Galha jovem', 'Galha madura', 'Fêmea adulta'],
  ),

  'process-mycoparasitism': card(
    'process-mycoparasitism',
    'Processo',
    'Micoparasitismo',
    'Um fungo atacando outro fungo',
    'Hy×Hy',
    '#8df0a8',
    [
      page('O que é?', 'Micoparasitismo ocorre quando um fungo reconhece, contacta e explora outro fungo como alvo.'),
      page('Mecanismos', 'Trichoderma pode crescer em direção ao patógeno, aderir, enrolar hifas e produzir enzimas que degradam componentes da parede celular.'),
      page('Função no jogo', 'A hifa verde alcança Rhizoctonia, reduz sua colonização e conclui a lise se a colônia mantiver vigor suficiente.'),
      page('Sinergias', 'Bacillus e Pseudomonas enfraquecem o foco e reduzem o custo do ataque para Trichoderma.'),
    ],
    ['Detecção', 'Crescimento dirigido', 'Contato', 'Enrolamento', 'Enzimas', 'Lise'],
  ),
};
