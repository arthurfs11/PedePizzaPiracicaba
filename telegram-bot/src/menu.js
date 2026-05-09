// Objetos mutáveis — atualizarCatalogo() atualiza in-place
// para que destructuring feito pelos módulos dependentes reflita as mudanças.
const PIZZAS = {
  salgadas: [
    { id: 'calabresa',     nome: 'Calabresa' },
    { id: 'mussarela',     nome: 'Mussarela' },
    { id: 'frango',        nome: 'Frango c/ Catupiry' },
    { id: 'portuguesa',    nome: 'Portuguesa' },
    { id: 'quatroqueijos', nome: 'Quatro Queijos' },
    { id: 'pepperoni',     nome: 'Pepperoni' },
    { id: 'margherita',    nome: 'Margherita' },
  ],
  doces: [
    { id: 'chocolate',    nome: 'Chocolate c/ Morango' },
    { id: 'prestigio',    nome: 'Prestígio' },
    { id: 'romeujulieta', nome: 'Romeu e Julieta' },
    { id: 'nutella',      nome: 'Nutella' },
    { id: 'bananutella',  nome: 'Banana c/ Nutella' },
  ],
};

const TAMANHOS = [
  { id: 'm', nome: 'Média',   fatias: 6,  preco: 35.00 },
  { id: 'g', nome: 'Grande',  fatias: 8,  preco: 45.00 },
  { id: 'f', nome: 'Família', fatias: 12, preco: 55.00 },
];

const ACOMPANHAMENTOS = [
  { id: 'ref', nome: 'Refrigerante 2L',   preco: 12.00 },
  { id: 'suc', nome: 'Suco 1L',           preco: 8.00  },
  { id: 'nan', nome: 'Sem acompanhamento',preco: 0     },
];

const BORDAS = [
  { id: 'catupiry',    nome: 'Catupiry',     preco: 6.00 },
  { id: 'creamcheese', nome: 'Cream Cheese', preco: 6.00 },
  { id: 'cheddar',     nome: 'Cheddar',      preco: 6.00 },
];

// Atualiza o catálogo em memória a partir dos dados vindos da API do dashboard.
// Muta os arrays/objetos in-place para que módulos que fizeram destructuring
// na importação ainda enxerguem os novos valores.
function atualizarCatalogo(catalog) {
  if (!catalog) return;
  if (catalog.PIZZAS?.salgadas) PIZZAS.salgadas = catalog.PIZZAS.salgadas;
  if (catalog.PIZZAS?.doces)    PIZZAS.doces    = catalog.PIZZAS.doces;
  if (Array.isArray(catalog.TAMANHOS))        TAMANHOS.splice(0, TAMANHOS.length, ...catalog.TAMANHOS);
  if (Array.isArray(catalog.BORDAS))          BORDAS.splice(0, BORDAS.length, ...catalog.BORDAS);
  if (Array.isArray(catalog.ACOMPANHAMENTOS)) ACOMPANHAMENTOS.splice(0, ACOMPANHAMENTOS.length, ...catalog.ACOMPANHAMENTOS);
  console.log('[BOT] Catálogo atualizado da API do dashboard.');
}

module.exports = { PIZZAS, TAMANHOS, ACOMPANHAMENTOS, BORDAS, atualizarCatalogo };
