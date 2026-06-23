// src/chat/types.ts
export interface CardData {
  id: string; name: string; cardType: string;
  cost: number | null; power: number | null;
  civilizations: string[]; races: string[];
  rarity: string | null; text: string | null;
  printings: { setCode: string; cardNumber: string; rarity?: string }[];
  setsContaining?: string[];
}
export interface RecipeData { id: string; name?: string; cards: { id: string; count: number }[]; validated?: boolean; [k: string]: unknown }
export interface RetrievalResult { cards: CardData[]; recipes: RecipeData[]; meta: string[]; knowledge: string[] }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }
