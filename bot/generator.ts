// Генерация коммерческого предложения через Gemini и сборка .docx.

import { GoogleGenAI, Type } from '@google/genai';
import { escapeHtml as e } from './telegram.ts';
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

export interface Brief {
  company: string; // кто вы и чем занимаетесь
  offer: string; // что предлагаете
  client: string; // кому КП
  terms: string; // цены и условия
  contacts: string; // контакты
}

export interface Proposal {
  title: string;
  subtitle: string;
  intro: string;
  sections: { heading: string; bullets: string[] }[];
  pricing: { item: string; price: string }[];
  callToAction: string;
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    subtitle: { type: Type.STRING },
    intro: { type: Type.STRING },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { heading: { type: Type.STRING }, bullets: { type: Type.ARRAY, items: { type: Type.STRING } } },
        required: ['heading', 'bullets'],
      },
    },
    pricing: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { item: { type: Type.STRING }, price: { type: Type.STRING } },
        required: ['item', 'price'],
      },
    },
    callToAction: { type: Type.STRING },
  },
  required: ['title', 'subtitle', 'intro', 'sections', 'pricing', 'callToAction'],
};

export async function generateProposal(ai: GoogleGenAI, model: string, brief: Brief): Promise<Proposal> {
  const prompt = `Ты — опытный B2B-копирайтер. Составь сильное коммерческое предложение на русском языке.

Отправитель: ${brief.company}
Предложение: ${brief.offer}
Получатель КП: ${brief.client}
Цены и условия: ${brief.terms}

Требования:
- Обращайся к боли и выгодам именно этого получателя, без воды и канцелярита.
- 3–5 смысловых разделов (например: «Что вы получаете», «Почему мы», «Как начнём работу», «Гарантии»), в каждом 3–5 конкретных пунктов.
- В pricing перенеси только цены из условий, ничего не выдумывай. Если цен нет — верни пустой массив.
- Не придумывай факты, цифры, клиентов и награды, которых нет во входных данных.
- callToAction — один чёткий следующий шаг для клиента.`;

  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.7 },
  });
  const text = res.text;
  if (!text) throw new Error('Пустой ответ модели');
  return JSON.parse(text) as Proposal;
}

const ACCENT = '0E7490';
const DARK = '1E293B';

export async function buildDocx(p: Proposal, contacts: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', bold: true, size: 20, color: ACCENT })], spacing: { after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: p.title, bold: true, size: 44, color: DARK })], spacing: { after: 120 } }),
    new Paragraph({ children: [new TextRun({ text: p.subtitle, size: 28, color: '475569' })], spacing: { after: 400 } }),
    new Paragraph({ children: [new TextRun({ text: p.intro, size: 24 })], spacing: { after: 300 } }),
  ];

  for (const s of p.sections) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: s.heading, bold: true, size: 30, color: DARK })],
        spacing: { before: 300, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
      }),
    );
    for (const b of s.bullets) {
      children.push(new Paragraph({ children: [new TextRun({ text: b, size: 24 })], bullet: { level: 0 }, spacing: { after: 60 } }));
    }
  }

  if (p.pricing.length) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: 'Стоимость', bold: true, size: 30, color: DARK })], spacing: { before: 300, after: 120 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: p.pricing.map(
          (r) =>
            new TableRow({
              children: [
                new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: r.item, size: 24 })] })] }),
                new TableCell({
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: r.price, bold: true, size: 24, color: ACCENT })] })],
                }),
              ],
            }),
        ),
      }),
    );
  }

  children.push(
    new Paragraph({ children: [new TextRun({ text: p.callToAction, bold: true, size: 26, color: ACCENT })], spacing: { before: 400, after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: 'Контакты', bold: true, size: 26, color: DARK })], spacing: { before: 200, after: 80 } }),
    ...contacts.split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, size: 24 })] })),
  );

  const doc = new Document({
    styles: { paragraphStyles: [{ id: 'Normal', name: 'Normal', run: { font: 'Arial', color: '333333' } }] },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

export function previewText(p: Proposal): string {
  const lines = [`<b>${e(p.title)}</b>`, e(p.subtitle), '', e(p.intro)];
  for (const s of p.sections.slice(0, 2)) lines.push('', `<b>${e(s.heading)}</b>`, ...s.bullets.map((b) => `• ${e(b)}`));
  return lines.join('\n');
}
