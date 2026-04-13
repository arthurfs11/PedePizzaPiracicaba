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
    { id: 'chocolate',     nome: 'Chocolate c/ Morango' },
    { id: 'prestigio',     nome: 'Prestígio' },
    { id: 'romeujulieta',  nome: 'Romeu e Julieta' },
    { id: 'nutella',       nome: 'Nutella' },
    { id: 'bananutella',   nome: 'Banana c/ Nutella' },
  ],
};

const TAMANHOS = [
  { id: 'm', nome: 'Média',   fatias: 6,  preco: 35.00 },
  { id: 'g', nome: 'Grande',  fatias: 8,  preco: 45.00 },
  { id: 'f', nome: 'Família', fatias: 12, preco: 55.00 },
];

const ACOMPANHAMENTOS = [
  { id: 'ref', nome: 'Refrigerante 2L', preco: 12.00 },
  { id: 'suc', nome: 'Suco 1L',         preco: 8.00  },
  { id: 'nan', nome: 'Sem acompanhamento', preco: 0  },
];

module.exports = { PIZZAS, TAMANHOS, ACOMPANHAMENTOS };
