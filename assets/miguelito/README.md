# Folhas de sprite do Miguelito

Skin alternativa do jogador. O astronauta desenhado no canvas continua sendo o
padrão e a rede de segurança: se qualquer folha faltar, não carregar ou vier com
medida inválida, o jogo volta a desenhá-lo sozinho, sem erro na tela.

## Como testar

```
?player=miguelito    troca para os sprites
?player=astronaut    volta para o astronauta
```

A escolha fica guardada no navegador, então dá para atravessar várias fases sem
repetir o parâmetro.

## Formato esperado

Uma **tira horizontal** por animação, com todos os quadros da mesma largura e
alinhados na mesma linha de base — o pé do personagem precisa ficar na mesma
altura em todos os quadros, senão a corrida sobe e desce.

- Fundo **transparente** (PNG com alfa). Fundo branco vira um retângulo branco.
- A largura de cada quadro é calculada como `largura da imagem ÷ frames`, então
  a tira não pode ter margem sobrando nas pontas.
- Personagem virado para a **direita**. O jogo espelha sozinho ao andar para a
  esquerda.

## Arquivos

| arquivo | estado | quadros declarados |
|---|---|---|
| `run.png` | corrida | 9 |

As demais (`idle`, `jump`, `dash`, `hurt`, `celebrate`, `pulse`) já têm linha
pronta e comentada em [`src/render/player-skins.js`](../../src/render/player-skins.js).
Enquanto não existirem, todos os estados caem na corrida pela cadeia de
fallback — o personagem nunca fica sem quadro.

## Se a proporção sair errada

Três números em `player-skins.js`, e nenhum deles mexe na física:

- `heightScale` — altura da arte em relação à caixa de colisão de 32×48.
  Está em `1.32` porque cabeça e mochila passam do corpo físico.
- `offsetX` / `offsetY` — deslocamento fino para o pé assentar na plataforma.

A caixa de colisão **não muda com a skin**. Toda a física — alturas de salto,
alcances, os desafios-assinatura validados por `validateChunk` — está medida em
cima de 32×48; uma arte que mudasse isso invalidaria as travessias já
verificadas.
