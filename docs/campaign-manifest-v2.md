# Manifesto da campanha didática — especificação revisada

Este documento acompanha `src/procgen/campaign-manifest.js` e consolida progressão, tutorial, pools, patógenos, desbloqueios, segmentos e provas finais.

## Princípio pedagógico irrenunciável

Um organismo novo deve ser explicado **no primeiro encontro por proximidade**. Criar ou desenhar o organismo distante, inclusive fora da câmera, não constitui encontro:

```text
primeira entrada no raio de detecção
→ cartão obrigatório imediatamente
```

Depois que Miguelito entra nesse raio, cooldown e pacing nunca podem silenciar o cartão obrigatório. Uma estreia fora da zona planejada abre o cartão e registra diagnóstico com fase, chunk, tipo, posição e pool.

## Campanha híbrida

```text
módulo fixo de introdução
→ prática procedural
→ segundo módulo fixo, quando necessário
→ desafio procedural ampliado
→ prova final
```

Somente primeiro encontro, demonstrações difíceis, desbloqueios e provas são autorais. O restante permanece procedural.

## Proteções complementares

### 1. Pool por fase e chunk

Usar `getProceduralPoolAt(phase, chunkIndex)`. Um organismo vagante só entra no procedural após `poolFromChunk`.

### 2. Tethering na estreia

O organismo vagante da estreia permanece perto da cena até o cartão ser visto. Evitar dependência circular: injetar `hasSeenCard` ou usar estado compartilhado simples.

### 3. Apresentações agrupadas e progressivas

Agrupamento é permitido somente para cadeias do mesmo organismo ou processo, como Bacillus→biofilme, Rhizobium→nódulo→FBN, Pseudomonas→sideróforo→ferro e micorriza→arbúsculo→absorção.

`pageUnlocks` define quais páginas cada gatilho libera. Em uma cadeia obrigatória, o primeiro encontro libera somente a página 0. Estruturas e processos posteriores atualizam a mesma entrada do GUIA. Com `suppressIndividualCards`, somente `autoOpenTrigger` abre o painel; os gatilhos derivados usam `derivedTriggerBehavior: 'guide-only'`.

Organismos diferentes nunca compartilham apresentação inicial. Fungos oportunistas e Trichoderma têm cartões próprios; micoparasitismo é uma apresentação posterior, condicionada a ambos já terem sido apresentados.

### 4. Tutorial por segmento

- `guided`: cartões e sequência autoral permitidos;
- `silent`: registra no GUIA, mas não pausa;
- `disabled`: não registra nem apresenta automaticamente.

Organismo novo encontrado por proximidade e ainda não explicado tem precedência sobre `silent`.

### 5. Supressão espacial como segurança

Depois de apresentação não obrigatória, aguardar aproximadamente 90% da largura visível ou 60 segundos:

```js
visibleWorldWidth = canvas.width / cameraZoom
minimumDistance = Math.max(600, visibleWorldWidth * 0.90)
```

Não aplicar depois do primeiro encontro por proximidade com organismo novo, nem a salto duplo, Dash ou Pulso. A distância controla principalmente o espaçamento entre zonas de estreia.

## Zonas de estreia

Cada organismo obrigatório declara um `debutZoneId`. Uma zona pode introduzir somente um tipo ainda não explicado. Outros organismos presentes nela precisam pertencer a apresentações já concluídas. A validação rejeita duas estreias obrigatórias com a mesma zona; testes de geração posteriores também devem verificar os raios reais das entidades autorais.

## Contrato do PR 1

O manifesto, seus helpers e o validador são adicionados sem importação pelo runtime. Este PR formaliza os contratos e falha cedo para referências, intervalos ou cadeias inválidas, mas não altera progressão, geração ou tutorial existentes.

## Poderes e geometria

Poder planejado para a fase não equivale a poder disponível no início. O gerador consulta `getAvailableUnlocksAt(phase, chunkIndex)`. O unlock do chunk N só pode ser exigido a partir de N+1.

Garantias:

- cristal somente em chunk com `pulse`;
- `pulse` somente depois do unlock;
- vão obrigatório de Dash somente depois do Dash;
- geometria obrigatória de salto duplo somente depois do salto duplo;
- ponte procedural somente depois de `mycorrhizaStructures`;
- raiz lateral procedural somente depois de `azospirillumRoots`.

## Organização da campanha

1. Prólogo — movimento e pulo.
2. Fase 1 — exsudato, recrutamento, Bacillus e biofilme.
3. Fase 2 — Rhizobium, nódulo e FBN.
4. Fase 3 — Azospirillum, raiz lateral e salto duplo.
5. Fase 4 — micorriza, arbúsculo, ponte e Dash.
6. Fase 5 — Pseudomonas, ferro, oportunista, Trichoderma e micoparasitismo.
7. Fase 6 — Rhizoctonia, saúde/recuperação e Pulso.
8. Fase 7 — Meloidogyne: J2, galha, fêmea, massa de ovos e sequela.
9. Fase 8 — síntese sem novos cartões automáticos.

Ralstonia fica para expansão pós-piloto.

## Ordem de Meloidogyne

```text
J2 → busca → penetração → migração → galha → fêmea → massa de ovos → eclosão
```

## Provas finais

As provas verificam estado real, não apenas cartão visto. Criar avaliador central de `{ type, key, operator, value }` e mapear as chaves abstratas ao estado real.

## Implementação por PRs

1. Manifesto, validador e testes, sem mudar comportamento.
2. Progressão e gating de habilidades.
3. Tutorial agrupado, modos e primeira aparição obrigatória.
4. Pool por chunk e tethering.
5. Fase 1 como corte vertical.
6. Uma fase por PR após playtest.
