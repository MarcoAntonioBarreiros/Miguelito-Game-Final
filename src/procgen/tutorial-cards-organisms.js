const page = (title, body, points = []) => ({ title, body, points });
const card = (id, category, title, subtitle, glyph, accent, pages, cycle = [], cycleLabel = 'Ciclo ou etapas') => ({
  id, category, title, subtitle, glyph, accent, pages, cycle, cycleLabel,
});

export const organismTutorialCards = {
  'organism-rhizobium': card(
    'organism-rhizobium',
    'Organismo benéfico',
    'Rhizobium',
    'Bactéria simbiótica formadora de nódulos',
    'N₂',
    '#79e8dc',
    [
      page('Quem é?', 'Rhizobium representa bactérias capazes de estabelecer simbiose com raízes de leguminosas.'),
      page(
        'Função biológica',
        'Após o reconhecimento entre bactéria e planta, ocorre a formação de nódulos. Dentro deles, bacteroides podem fixar nitrogênio atmosférico.',
      ),
      page(
        'Função no jogo',
        'Leve Rhizobium até uma raiz e inocule. Nódulos ativos aumentam Solo e Esperança e ajudam na recuperação metabólica da raiz.',
      ),
      page(
        'Como favorecer',
        'Mantenha carbono disponível por meio de exsudatos e preserve o transporte da raiz. Nódulos perdem atividade em raízes muito danificadas ou com murcha vascular.',
      ),
    ],
    ['Reconhecimento', 'Curvatura do pelo', 'Fio de infecção', 'Primórdio', 'Nódulo maduro', 'FBN'],
  ),

  'organism-azospirillum': card(
    'organism-azospirillum',
    'Organismo benéfico',
    'Azospirillum',
    'Bactéria associativa promotora de crescimento',
    'Azo',
    '#72e8dd',
    [
      page('Quem é?', 'Azospirillum reúne bactérias associadas à superfície e às regiões próximas das raízes de várias plantas.'),
      page(
        'Função biológica',
        'Pode contribuir para o crescimento vegetal por sinalização hormonal, mudanças na arquitetura radicular e outros mecanismos dependentes da estirpe e do hospedeiro.',
      ),
      page(
        'Função no jogo',
        'Quando inoculado em uma raiz e sustentado por exsudatos, induz o desenvolvimento de raízes laterais que ampliam a área explorável.',
      ),
      page(
        'Atenção didática',
        'Azospirillum não forma os nódulos típicos de Rhizobium. As raízes laterais representam seu efeito sobre a arquitetura da planta.',
      ),
    ],
    ['Rizoplano', 'Sinalização', 'Primórdio lateral', 'Emergência', 'Alongamento', 'Raiz madura'],
  ),

  'organism-mycorrhiza': card(
    'organism-mycorrhiza',
    'Organismo benéfico',
    'Micorriza arbuscular',
    'Simbiose entre fungo e raiz',
    'AMF',
    '#d6afff',
    [
      page('Quem é?', 'Fungos micorrízicos arbusculares formam uma associação íntima com raízes e dependem de uma planta hospedeira para completar seu ciclo.'),
      page(
        'Função biológica',
        'As hifas exploram o solo além da zona alcançada pelos pelos radiculares. Dentro das células corticais, os arbúsculos funcionam como interfaces de troca.',
      ),
      page('Função no jogo', 'A micorriza melhora recuperação e sustentação da raiz. Também pode formar pontes e escadas jogáveis.'),
      page(
        'Atenção didática',
        'As estruturas capazes de sustentar Miguelito são uma metáfora visual. Hifas reais ampliam absorção e conectividade, mas não formam plataformas para pessoas.',
      ),
    ],
    ['Propágulo', 'Contato com a raiz', 'Colonização cortical', 'Arbúsculos', 'Rede extrarradicular', 'Novos propágulos'],
  ),

  'organism-bacillus': card(
    'organism-bacillus',
    'Organismo benéfico',
    'Bacillus',
    'Biofilme, resistência e bioproteção',
    'B',
    '#70e5d6',
    [
      page('Quem é?', 'Bacillus representa bactérias formadoras de endósporos, capazes de persistir em condições ambientais desfavoráveis.'),
      page(
        'Função biológica',
        'Algumas estirpes formam biofilmes, produzem compostos antimicrobianos e podem estimular respostas de defesa da planta.',
      ),
      page(
        'Função no jogo',
        'Biofilmes maduros protegem raízes, repelem J2, reduzem patógenos, limpam contaminação de Miguelito e funcionam como pontos de retorno.',
      ),
      page('Como manter ativo', 'Forneça exsudatos. Sem carbono, a colônia pode esporular e reduzir temporariamente sua proteção.'),
    ],
    ['Célula vegetativa', 'Colonização', 'Biofilme', 'Estresse', 'Endósporo', 'Germinação'],
  ),

  'organism-pseudomonas': card(
    'organism-pseudomonas',
    'Organismo benéfico',
    'Pseudomonas',
    'Competição por ferro na rizosfera',
    'Fe',
    '#b9f36f',
    [
      page('Quem é?', 'Pseudomonas representa bactérias rizosféricas móveis; algumas estirpes fluorescentes produzem sideróforos de alta afinidade.'),
      page(
        'Função biológica',
        'Ao capturar ferro, podem aumentar sua própria competitividade e limitar microrganismos que dependem do mesmo recurso.',
      ),
      page(
        'Função no jogo',
        'A colônia envia sideróforos aos depósitos de Fe³⁺. A reserva recuperada enfraquece fungos e ajuda a conter Rhizoctonia e Ralstonia.',
      ),
      page('Como usar', 'Inocule perto de uma raiz ameaçada e permita que a colônia alcance depósitos de ferro antes que a doença avance.'),
    ],
    ['Quimiotaxia', 'Colonização', 'Sideróforo', 'Captura de Fe³⁺', 'Retorno à colônia'],
    'Etapas funcionais',
  ),

  'organism-trichoderma': card(
    'organism-trichoderma',
    'Organismo benéfico',
    'Trichoderma',
    'Fungo de biocontrole e competidor da rizosfera',
    'Tri',
    '#8df0a8',
    [
      page('Quem é?', 'Trichoderma reúne fungos filamentosos comuns no solo e associados à rizosfera.'),
      page(
        'Função biológica',
        'Dependendo da espécie e da estirpe, pode competir por recursos, produzir metabólitos e enzimas e parasitar outros fungos.',
      ),
      page(
        'Função no jogo',
        'Hifas procuram Rhizoctonia, fungos oportunistas, massas de ovos e J2 expostos. O ataque consome vigor.',
      ),
      page(
        'Atenção didática',
        'A atividade contra nematoides varia entre isolados e condições. O jogo resume diferentes mecanismos de controle biológico em uma resposta visível.',
      ),
    ],
    ['Germinação', 'Crescimento hifal', 'Reconhecimento do alvo', 'Contato e enrolamento', 'Enzimas', 'Esporulação'],
  ),

  'organism-phosphate-solubilizer': card(
    'organism-phosphate-solubilizer',
    'Organismo benéfico',
    'Microrganismo solubilizador de fósforo',
    'Mobilização de fósforo pouco disponível',
    'P',
    '#8db8ff',
    [
      page('Quem é?', 'Não se trata de uma única espécie. Diferentes bactérias e fungos podem aumentar a disponibilidade de formas pouco solúveis de fósforo.'),
      page(
        'Função biológica',
        'Ácidos orgânicos, prótons, enzimas e outros mecanismos podem mobilizar fósforo, dependendo do composto e das condições do solo.',
      ),
      page('Função no jogo', 'Sua descoberta está ligada ao pulso mineral e à liberação de recursos presos nos cristais alaranjados.'),
      page(
        'Atenção didática',
        'O rompimento instantâneo dos cristais é uma metáfora. Na natureza, a mobilização é gradual e depende da química do solo.',
      ),
    ],
    ['Colonização', 'Secreção', 'Interação com mineral', 'Mobilização de P', 'Absorção'],
    'Etapas funcionais',
  ),

  'organism-opportunistic-fungus': card(
    'organism-opportunistic-fungus',
    'Patógeno',
    'Fungo oportunista',
    'Colonização favorecida por tecido enfraquecido',
    'Hy',
    '#ff8297',
    [
      page('Quem é?', 'O cartão representa uma categoria de fungos que aproveitam ferimentos, estresse ou desequilíbrio para colonizar tecidos.'),
      page(
        'Função biológica',
        'A severidade depende do fungo, da planta, do ambiente e das condições do tecido. Nem todo fungo do solo é patogênico.',
      ),
      page(
        'Função no jogo',
        'O contato acumula propágulos na roupa de Miguelito, reduz movimento e pode causar perda periódica de Vitalidade.',
      ),
      page('Como controlar', 'Pulso, Bacillus e Trichoderma reduzem a contaminação. Pseudomonas pode enfraquecer fungos pela competição por ferro.'),
    ],
    ['Propágulo', 'Contato', 'Germinação', 'Colonização', 'Produção de novos propágulos'],
  ),

  'organism-rhizoctonia': card(
    'organism-rhizoctonia',
    'Patógeno',
    'Rhizoctonia',
    'Fungo de solo associado a podridões radiculares',
    'R',
    '#ff7f91',
    [
      page('Quem é?', 'Rhizoctonia representa um patógeno de solo capaz de sobreviver como micélio e estruturas resistentes e infectar tecidos próximos ao solo.'),
      page(
        'Função biológica',
        'As hifas crescem sobre a superfície, formam estruturas de infecção e degradam o tecido, causando lesões e podridão.',
      ),
      page('Função no jogo', 'O foco se espalha pela raiz, reduz sua saúde e lança investidas hifais contra Miguelito.'),
      page(
        'Como controlar',
        'Bacillus contém o avanço, Pseudomonas limita o vigor, Trichoderma realiza micoparasitismo e o pulso interrompe diretamente o foco.',
      ),
    ],
    ['Sobrevivência no solo', 'Crescimento hifal', 'Almofada de infecção', 'Colonização', 'Lesão', 'Persistência'],
  ),

  'organism-ralstonia': card(
    'organism-ralstonia',
    'Patógeno',
    'Ralstonia',
    'Bactéria causadora de murcha vascular',
    'Rs',
    '#e8c27e',
    [
      page('Quem é?', 'Ralstonia representa o complexo de espécies associado à murcha bacteriana de numerosas plantas hospedeiras.'),
      page(
        'Função biológica',
        'A bactéria entra principalmente pelas raízes e ferimentos, alcança o xilema, multiplica-se e contribui para a obstrução do transporte de água.',
      ),
      page(
        'Função no jogo',
        'A infecção reduz transporte, carbono, nutrição, FBN e estabilidade. Em estágio crítico, a raiz pode ceder e ferir Miguelito.',
      ),
      page(
        'Como controlar',
        'A prevenção precoce com Bacillus e Pseudomonas é mais eficiente. Depois da colonização vascular, o controle apenas desacelera a doença.',
      ),
    ],
    ['Sobrevivência no ambiente', 'Entrada pela raiz', 'Colonização do xilema', 'Multiplicação', 'Murcha', 'Disseminação'],
  ),

  'organism-meloidogyne-j2': card(
    'organism-meloidogyne-j2',
    'Patógeno',
    'Meloidogyne — juvenil J2',
    'Estágio infectivo do nematoide-das-galhas',
    'J2',
    '#fff0cf',
    [
      page('Quem é?', 'O J2 é o juvenil infectivo que deixa a massa de ovos e procura uma raiz hospedeira.'),
      page(
        'Função biológica',
        'Ele penetra a raiz, migra entre os tecidos e estabelece um sítio permanente de alimentação, induzindo células gigantes.',
      ),
      page(
        'Função no jogo',
        'J2 livres procuram raízes e podem aderir à roupa de Miguelito como transporte passivo. Depois da penetração, iniciam uma galha.',
      ),
      page(
        'Como controlar',
        'Bacillus reduz atração e penetração. Trichoderma pode interceptar apenas J2 ainda livres. Estágios internos ficam protegidos pelo tecido.',
      ),
    ],
    ['Ovo com J1', 'Muda para J2', 'Eclosão', 'Penetração', 'Migração', 'Sítio de alimentação'],
  ),

  'organism-meloidogyne-female': card(
    'organism-meloidogyne-female',
    'Patógeno',
    'Meloidogyne — fêmea adulta',
    'Estágio sedentário que mantém a galha e produz ovos',
    '♀',
    '#f4d7c4',
    [
      page('Quem é?', 'Após estabelecer o sítio de alimentação, a fêmea aumenta muito de volume e permanece sedentária dentro da raiz.'),
      page(
        'Prejuízo biológico',
        'A alimentação contínua desvia recursos, altera o tecido vascular e mantém células gigantes metabolicamente ativas.',
      ),
      page(
        'Função no jogo',
        'A fêmea drena a raiz, reduz a recuperação, diminui permanentemente sua saúde máxima e produz novas massas de ovos.',
      ),
      page(
        'Por que prevenir?',
        'Trichoderma não alcança a fêmea dentro do tecido. Controlar ovos e J2 antes da penetração evita a sequela permanente.',
      ),
    ],
    ['J2 interno', 'J3/J4 sedentários', 'Fêmea dilatada', 'Alimentação contínua', 'Massa de ovos'],
  ),
};
