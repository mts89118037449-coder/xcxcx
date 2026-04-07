import React, { useRef, useState, createContext, useContext, useEffect } from 'react';
import { Printer, Phone, Mail, MapPin, Check, Clock, Shield, Sparkles, Building, Droplets, Wind, Bed, Award, Briefcase, FileText, Download } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, PageBreak, BorderStyle, VerticalAlign } from 'docx';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

interface ContentState {
  [key: string]: string;
}

const defaultContent: ContentState = {
  'cover-title': 'ВАШ ПАРТНЕР',
  'cover-subtitle': 'Профессиональная прачечная',
  'cover-type': 'Коммерческое предложение',
  'cover-heading-1': 'Безупречная чистота',
  'cover-heading-2': 'для ваших гостей',
  'cover-desc': 'Индивидуальные решения по профессиональному уходу за текстилем, разработанные специально для сети гостиниц Cosmos.',
  'mission-title': 'Наша миссия',
  'mission-text': '«Чистота во всем. Мы не просто стираем белье — мы заботимся о репутации вашего отеля, создавая безупречный комфорт.»',
  'contact-city': 'г. Мурманск',
  'contact-phone': '+7 (991) 112-56-86',
  'about-title': 'О компании',
  'about-p1': 'Прачечная «Ваш Партнер» успешно работает на рынке Мурманска уже 10 лет. За это время мы выстроили безупречные процессы и собрали штат профессионалов.',
  'about-p2': '95% нашей работы — это сотрудничество с гостиницами разного уровня и категорий. Мы досконально знаем специфику отельного бизнеса и готовы соответствовать высочайшим стандартам сети Cosmos.',
  'clients-title': 'С кем мы работаем',
  'client-1': 'Гостиницы и Мини-отели',
  'client-2': 'Хостелы',
  'client-3': 'Фитнес-центры',
  'client-4': 'Туристические базы',
  'client-5': 'Дома отдыха',
  'why-title': 'Почему выбирают нас',
  'why-1-title': 'Профессиональный подход',
  'why-1-text': 'Работа на передовом оборудовании с использованием специализированных средств.',
  'why-2-title': 'Строгая логистика',
  'why-2-text': 'Забор и доставка белья осуществляются строго по согласованному графику.',
  'why-3-title': 'Удобный сервис',
  'why-3-text': 'Электронный документооборот (ЭДО). Аренда белья под нужды отеля.',
  'why-4-title': 'Бережное отношение',
  'why-4-text': 'Штат опытных сотрудников гарантирует максимальную сохранность текстиля.',
  'promo-title': 'Пробная стирка — бесплатно',
  'promo-text': 'Мы заберём на тестовую стирку до 10 кг белого или цветного белья.',
  'prices-title': 'Тарифы на услуги',
  'price-1-title': 'Прямое бельё',
  'price-1-desc': 'Простыни, пододеяльники, покрывала',
  'price-1-price': 'от 105 ₽',
  'price-1-unit': ' / кг',
  'price-1-note': 'Мин. заказ 5 кг',
  'price-2-title': 'Махровые изделия',
  'price-2-desc': 'Полотенца, халаты, коврики',
  'price-2-price': 'от 115 ₽',
  'price-2-unit': ' / кг',
  'price-2-note': 'Беспл. доставка от 5 000 ₽',
  'price-3-title': 'Подушки и Одеяла',
  'price-3-desc': 'Подушки (синтетика), одеяла, пледы',
  'price-3-price': 'от 400 ₽',
  'price-3-unit': ' / шт',
  'price-note': 'Срочный заказ рассчитывается с коэффициентом +50% к базовой стоимости.',
  'contact-title': 'Контакты',
  'address-text': 'Мурманск, ул. Капитана Орликовой, 15, ТЦ \'Старт\'',
  'phone-text': '+7 (991) 112-56-86',
  'email-text': 'Partner.stirka@mail.ru',
  'req-title': 'Реквизиты',
  'req-company': 'ООО \'ВАШ ПАРТНЕР\'',
  'req-inn': '5118006863',
  'req-kpp': '511801001',
  'req-ogrn': '1245100001882'
};

const ContentContext = createContext<{
  content: ContentState;
  onChange: (id: string, value: string) => void;
  isExporting: boolean;
}>({ content: {}, onChange: () => {}, isExporting: false });

const EditableText = ({ id, className, defaultText, as: Component = 'span' }: any) => {
  const { content, onChange, isExporting } = useContext(ContentContext);
  const value = content[id] !== undefined ? content[id] : defaultText;
  const elementRef = useRef<HTMLElement>(null);
  
  // Update local content when global content changes, but not if we are currently editing it
  useEffect(() => {
    if (elementRef.current && elementRef.current.innerText !== value && document.activeElement !== elementRef.current) {
      elementRef.current.innerText = value;
    }
  }, [value]);

  if (isExporting) {
    return <Component className={className} style={{ whiteSpace: 'pre-wrap' }}>{value}</Component>;
  }

  return (
    <Component
      ref={elementRef}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e: any) => onChange(id, e.target.innerText)}
      className={`outline-none hover:ring-2 hover:ring-[#06b6d480] hover:bg-[#ffffff1a] focus:ring-2 focus:ring-[#06b6d480] focus:bg-[#ffffff1a] transition-all cursor-text rounded-sm ${className}`}
      style={{ whiteSpace: 'pre-wrap', minWidth: '1em', display: Component === 'span' ? 'inline-block' : 'block' }}
    >
      {value}
    </Component>
  );
};

export default function App() {
  const documentRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<ContentState>(defaultContent);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const handleContentChange = (id: string, value: string) => {
    setContent(prev => ({ ...prev, [id]: value }));
  };

  const getText = (id: string) => content[id] || '';

  const generatePDF = async () => {
    const element = documentRef.current;
    if (!element) return;

    setIsExportingPDF(true);
    
    // Wait for React to re-render EditableText as plain text
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const opt = {
        margin: 0,
        filename: 'Commercial_Offer_Vash_Partner.pdf',
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
        jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Произошла ошибка при создании PDF. Пожалуйста, попробуйте еще раз.");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const generateDocx = async () => {
    setIsExportingDocx(true);
    try {
      const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: "Normal",
            name: "Normal",
            basedOn: "Normal",
            next: "Normal",
            run: { font: "Arial", size: 24, color: "333333" },
          },
        ],
      },
      sections: [
        {
          properties: {},
          children: [
            // PAGE 1
            new Paragraph({
              children: [new TextRun({ text: getText('cover-title'), bold: true, size: 48, color: "1E293B" })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 400, after: 200 },
            }),
            new Paragraph({
              children: [new TextRun({ text: getText('cover-subtitle'), size: 28, color: "F59E0B" })],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "", spacing: { after: 800 } }),
            new Paragraph({
              children: [new TextRun({ text: getText('cover-type'), bold: true, size: 32, color: "F59E0B" })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new Paragraph({
              children: [new TextRun({ text: getText('cover-heading-1') + " " + getText('cover-heading-2'), bold: true, size: 56, color: "1E293B" })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new Paragraph({
              children: [new TextRun({ text: getText('cover-desc'), size: 28 })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 800 },
            }),
            new Paragraph({
              children: [new TextRun({ text: getText('mission-title'), bold: true, size: 32, color: "1E293B" })],
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [new TextRun({ text: getText('mission-text'), italics: true, size: 28 })],
              spacing: { after: 800 },
            }),
            new Paragraph({
              children: [new TextRun({ text: `${getText('contact-city')} | ${getText('contact-phone')}`, bold: true, size: 24 })],
              alignment: AlignmentType.CENTER,
            }),
            
            new Paragraph({ children: [new PageBreak()] }),

            // PAGE 2
            new Paragraph({
              children: [new TextRun({ text: getText('about-title'), bold: true, size: 48, color: "1E293B" })],
              spacing: { after: 400 },
            }),
            new Paragraph({ children: [new TextRun({ text: getText('about-p1') })], spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: getText('about-p2') })], spacing: { after: 400 } }),
            
            new Paragraph({
              children: [new TextRun({ text: getText('clients-title'), bold: true, size: 32, color: "F59E0B" })],
              spacing: { after: 200 },
            }),
            new Paragraph({ text: `• ${getText('client-1')}` }),
            new Paragraph({ text: `• ${getText('client-2')}` }),
            new Paragraph({ text: `• ${getText('client-3')}` }),
            new Paragraph({ text: `• ${getText('client-4')}` }),
            new Paragraph({ text: `• ${getText('client-5')}` }),
            new Paragraph({ text: "", spacing: { after: 400 } }),
            
            new Paragraph({
              children: [new TextRun({ text: getText('why-title'), bold: true, size: 36, color: "1E293B" })],
              spacing: { after: 400 },
            }),
            new Paragraph({ children: [new TextRun({ text: getText('why-1-title'), bold: true, color: "F59E0B" })] }),
            new Paragraph({ children: [new TextRun({ text: getText('why-1-text') })], spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: getText('why-2-title'), bold: true, color: "F59E0B" })] }),
            new Paragraph({ children: [new TextRun({ text: getText('why-2-text') })], spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: getText('why-3-title'), bold: true, color: "F59E0B" })] }),
            new Paragraph({ children: [new TextRun({ text: getText('why-3-text') })], spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: getText('why-4-title'), bold: true, color: "F59E0B" })] }),
            new Paragraph({ children: [new TextRun({ text: getText('why-4-text') })], spacing: { after: 400 } }),
            
            new Paragraph({
              children: [new TextRun({ text: getText('promo-title'), bold: true, size: 32, color: "1E293B" })],
              spacing: { after: 200 },
            }),
            new Paragraph({ children: [new TextRun({ text: getText('promo-text') })] }),

            new Paragraph({ children: [new PageBreak()] }),

            // PAGE 3
            new Paragraph({
              children: [new TextRun({ text: getText('prices-title'), bold: true, size: 48, color: "1E293B" })],
              spacing: { after: 400 },
            }),
            
            // Table for prices
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getText('price-1-title'), bold: true })] })], margins: { top: 200, bottom: 200 } }),
                    new TableCell({ children: [new Paragraph(getText('price-1-desc'))], margins: { top: 200, bottom: 200 } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getText('price-1-price') + getText('price-1-unit'), bold: true })] }), new Paragraph({ children: [new TextRun({ text: getText('price-1-note'), size: 20, color: "64748B" })] })], margins: { top: 200, bottom: 200 } }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getText('price-2-title'), bold: true })] })], margins: { top: 200, bottom: 200 } }),
                    new TableCell({ children: [new Paragraph(getText('price-2-desc'))], margins: { top: 200, bottom: 200 } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getText('price-2-price') + getText('price-2-unit'), bold: true })] }), new Paragraph({ children: [new TextRun({ text: getText('price-2-note'), size: 20, color: "F59E0B" })] })], margins: { top: 200, bottom: 200 } }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getText('price-3-title'), bold: true })] })], margins: { top: 200, bottom: 200 } }),
                    new TableCell({ children: [new Paragraph(getText('price-3-desc'))], margins: { top: 200, bottom: 200 } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getText('price-3-price') + getText('price-3-unit'), bold: true })] })], margins: { top: 200, bottom: 200 } }),
                  ],
                }),
              ],
            }),
            new Paragraph({ text: "", spacing: { after: 200 } }),
            new Paragraph({
              children: [new TextRun({ text: getText('price-note'), italics: true, color: "64748B" })],
              spacing: { after: 600 },
            }),
            
            new Paragraph({
              children: [new TextRun({ text: getText('contact-title'), bold: true, size: 36, color: "1E293B" })],
              spacing: { after: 200 },
            }),
            new Paragraph({ text: `Адрес: ${getText('address-text')}` }),
            new Paragraph({ text: `Телефон: ${getText('phone-text')}` }),
            new Paragraph({ text: `Email: ${getText('email-text')}` }),
            new Paragraph({ text: "", spacing: { after: 400 } }),
            
            new Paragraph({
              children: [new TextRun({ text: getText('req-title'), bold: true, size: 36, color: "1E293B" })],
              spacing: { after: 200 },
            }),
            new Paragraph({ text: getText('req-company') }),
            new Paragraph({ text: `ИНН: ${getText('req-inn')}` }),
            new Paragraph({ text: `КПП: ${getText('req-kpp')}` }),
            new Paragraph({ text: `ОГРН: ${getText('req-ogrn')}` }),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, "Commercial_Offer_Vash_Partner.docx");
    } catch (error) {
      console.error("Failed to generate DOCX:", error);
      alert("Произошла ошибка при создании Word документа. Пожалуйста, попробуйте еще раз.");
    } finally {
      setIsExportingDocx(false);
    }
  };

  return (
    <ContentContext.Provider value={{ content, onChange: handleContentChange, isExporting: isExportingPDF || isExportingDocx }}>
      <div className="min-h-screen bg-gray-200 py-8 print:py-0 print:bg-white flex flex-col items-center font-sans">
      
      {/* Top Banner */}
      <div className="mb-6 bg-blue-50 text-blue-800 px-6 py-3 rounded-md shadow-sm flex items-center gap-3 print:hidden max-w-[210mm] w-full border border-blue-200">
        <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
        <p className="text-sm font-medium">Вы можете редактировать любой текст прямо здесь! Просто кликните на нужную строку и измените её перед экспортом.</p>
      </div>

      {/* Action Buttons */}
      <div className="mb-8 flex gap-4 print:hidden">
        <button 
          onClick={generatePDF} 
          disabled={isExportingPDF}
          className="flex items-center gap-2 bg-blue-900 text-white px-8 py-3 rounded-none shadow-xl hover:bg-blue-800 transition-all uppercase tracking-wider text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExportingPDF ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download size={18} />
          )}
          Скачать PDF
        </button>
        <button 
          onClick={() => window.print()} 
          className="flex items-center gap-2 bg-blue-700 text-white px-8 py-3 rounded-none shadow-xl hover:bg-blue-600 transition-all uppercase tracking-wider text-sm font-medium"
        >
          <Printer size={18} />
          Печать
        </button>
        <button 
          onClick={generateDocx} 
          disabled={isExportingDocx}
          className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-none shadow-xl hover:bg-blue-700 transition-all uppercase tracking-wider text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExportingDocx ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <FileText size={18} />
          )}
          Экспорт в Word
        </button>
      </div>

      {/* DOCUMENT CONTAINER FOR PDF EXPORT */}
      <div ref={documentRef} className={`flex flex-col ${isExportingPDF ? 'gap-0' : 'gap-8 print:gap-0'}`}>
        
        {/* PAGE 1: COVER (Dark Geometric) */}
        <div className="w-[210mm] min-h-[297mm] bg-blue-900 text-white shadow-2xl print:shadow-none relative overflow-hidden flex flex-col print:page-break-after-always">
          
          {/* Background Image with Diagonal Cut */}
          <div className="absolute top-0 right-0 w-[65%] h-full z-0 [clip-path:polygon(25%_0,100%_0,100%_100%,0_100%)]">
            <img 
              src="https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=800&q=80" 
              alt="Clean Towels" 
              className="w-full h-full object-cover opacity-50 mix-blend-luminosity"
              crossOrigin="anonymous"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900 via-[#1e3a8acc] to-transparent"></div>
          </div>

          {/* Geometric Accents */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-cyan-500 z-10 [clip-path:polygon(100%_0,100%_100%,0_0)] mix-blend-multiply opacity-80"></div>
          <div className="absolute bottom-0 right-10 w-[200px] h-[200px] bg-[#06b6d433] z-10 [clip-path:polygon(50%_100%,100%_0,0_0)] backdrop-blur-md"></div>
          
          {/* Static Dot Pattern Overlay */}
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none z-0" style={{ backgroundImage: 'radial-gradient(#fff 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}></div>

          <div className="p-16 pl-20 flex-1 flex flex-col relative z-20 w-[75%]">
            <header className="border-b border-[#ffffff33] pb-8 flex justify-between items-end">
              <div>
                <EditableText id="cover-title" as="h1" className="text-3xl font-bold tracking-widest" defaultText="ВАШ ПАРТНЕР" />
                <EditableText id="cover-subtitle" as="p" className="text-cyan-500 text-xs tracking-[0.3em] uppercase mt-2 font-medium" defaultText="Профессиональная прачечная" />
              </div>
            </header>

            <main className="flex-1 flex flex-col justify-center mt-12">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-[2px] bg-cyan-500"></div>
                <EditableText id="cover-type" as="p" className="text-cyan-500 tracking-[0.2em] uppercase text-sm font-medium" defaultText="Коммерческое предложение" />
              </div>
              
              <h2 className="text-6xl font-serif leading-[1.1] mb-10">
                <EditableText id="cover-heading-1" as="span" className="block" defaultText="Безупречная чистота" />
                <EditableText id="cover-heading-2" as="span" className="text-[#ffffff99] italic font-light block" defaultText="для ваших гостей" />
              </h2>
              
              <EditableText id="cover-desc" as="p" className="text-xl text-[#ffffffcc] max-w-md font-light leading-relaxed mb-16" defaultText="Индивидуальные решения по профессиональному уходу за текстилем, разработанные специально для сети гостиниц Cosmos." />

              <div className="relative">
                {/* Decorative triangle behind the box */}
                <div className="absolute -top-6 -left-6 w-16 h-16 bg-cyan-500 [clip-path:polygon(0_0,100%_100%,0_100%)] z-0"></div>
                <div className="bg-[#ffffff1a] backdrop-blur-md border border-[#ffffff33] p-8 relative z-10 max-w-lg">
                  <div className="flex items-start gap-4">
                    <Sparkles className="text-cyan-400 w-8 h-8 shrink-0 mt-1" strokeWidth={1.5} />
                    <div>
                      <EditableText id="mission-title" as="h3" className="text-lg font-medium text-white mb-2 tracking-wide uppercase text-sm" defaultText="Наша миссия" />
                      <EditableText id="mission-text" as="p" className="text-lg text-[#ffffffe6] italic font-serif leading-relaxed" defaultText="«Чистота во всем. Мы не просто стираем белье — мы заботимся о репутации вашего отеля, создавая безупречный комфорт.»" />
                    </div>
                  </div>
                </div>
              </div>
            </main>

            <footer className="mt-auto pt-8 flex gap-12 items-center text-sm font-light tracking-wide text-[#ffffffb3]">
              <div className="flex items-center gap-3">
                <MapPin className="text-cyan-500 w-4 h-4" />
                <EditableText id="contact-city" as="span" defaultText="г. Мурманск" />
              </div>
              <div className="flex items-center gap-3">
                <Phone className="text-cyan-500 w-4 h-4" />
                <EditableText id="contact-phone" as="span" defaultText="+7 (991) 112-56-86" />
              </div>
            </footer>
          </div>
        </div>

        {/* PAGE 2: ABOUT & ADVANTAGES (Light with Hexagons/Triangles) */}
        <div className="w-[210mm] min-h-[297mm] bg-blue-50 text-blue-900 shadow-2xl print:shadow-none relative overflow-hidden flex flex-col print:page-break-after-always">
          
          {/* Static Pattern */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'radial-gradient(#0f172a 2px, transparent 2px)', backgroundSize: '32px 32px' }}></div>
          
          {/* Top Right Image in a Triangle */}
          <div className="absolute top-0 right-0 w-[450px] h-[450px] z-0 [clip-path:polygon(100%_0,100%_100%,0_0)]">
            <img 
              src="https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=800&q=80" 
              alt="Industrial Laundry" 
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
            <div className="absolute inset-0 bg-[#1e3a8a1a] mix-blend-multiply"></div>
          </div>
          
          {/* Accent Triangles */}
          <div className="absolute top-[450px] right-0 w-[150px] h-[150px] bg-cyan-500 z-10 [clip-path:polygon(100%_0,100%_100%,0_0)]"></div>
          <div className="absolute top-[300px] right-[150px] w-[80px] h-[80px] bg-blue-900 z-10 [clip-path:polygon(0_0,100%_100%,0_100%)]"></div>

          <div className="p-16 pl-20 flex-1 flex flex-col relative z-20">
            <div className="mb-12 flex items-end justify-between border-b border-blue-200 pb-6 max-w-[60%]">
              <EditableText id="about-title" as="h2" className="text-4xl font-serif text-blue-900" defaultText="О компании" />
            </div>

            <div className="grid grid-cols-12 gap-12 mb-16">
              <div className="col-span-7">
                <EditableText id="about-p1" as="p" className="text-blue-700 leading-relaxed mb-6 text-lg font-light" defaultText="Прачечная «Ваш Партнер» успешно работает на рынке Мурманска уже 10 лет. За это время мы выстроили безупречные процессы и собрали штат профессионалов." />
                <EditableText id="about-p2" as="p" className="text-blue-700 leading-relaxed text-lg font-light" defaultText="95% нашей работы — это сотрудничество с гостиницами разного уровня и категорий. Мы досконально знаем специфику отельного бизнеса и готовы соответствовать высочайшим стандартам сети Cosmos." />
              </div>
              <div className="col-span-5 bg-white p-8 shadow-lg relative">
                {/* Small accent triangle on the card */}
                <div className="absolute top-0 right-0 w-8 h-8 bg-cyan-500 [clip-path:polygon(100%_0,100%_100%,0_0)]"></div>
                
                <h3 className="font-medium text-blue-900 mb-6 flex items-center gap-3 tracking-wide uppercase text-sm">
                  <Building className="text-cyan-600 w-5 h-5" strokeWidth={1.5} />
                  <EditableText id="clients-title" as="span" defaultText="С кем мы работаем" />
                </h3>
                <ul className="space-y-4 text-blue-600 font-light text-sm">
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-cyan-500 shrink-0" /> <EditableText id="client-1" as="span" defaultText="Гостиницы и Мини-отели" /></li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-cyan-500 shrink-0" /> <EditableText id="client-2" as="span" defaultText="Хостелы" /></li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-cyan-500 shrink-0" /> <EditableText id="client-3" as="span" defaultText="Фитнес-центры" /></li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-cyan-500 shrink-0" /> <EditableText id="client-4" as="span" defaultText="Туристические базы" /></li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-cyan-500 shrink-0" /> <EditableText id="client-5" as="span" defaultText="Дома отдыха" /></li>
                </ul>
              </div>
            </div>

            <div className="mb-12">
              <EditableText id="why-title" as="h2" className="text-2xl font-serif text-blue-900 mb-10" defaultText="Почему выбирают нас" />
              <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                <div className="flex gap-5">
                  <div className="w-14 h-14 bg-blue-900 text-cyan-500 flex items-center justify-center shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]">
                    <Award strokeWidth={1.5} size={20} />
                  </div>
                  <div>
                    <EditableText id="why-1-title" as="h4" className="font-medium text-blue-900 mb-2 tracking-wide" defaultText="Профессиональный подход" />
                    <EditableText id="why-1-text" as="p" className="text-sm text-blue-600 font-light leading-relaxed" defaultText="Работа на передовом оборудовании с использованием специализированных средств." />
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="w-14 h-14 bg-blue-900 text-cyan-500 flex items-center justify-center shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]">
                    <Clock strokeWidth={1.5} size={20} />
                  </div>
                  <div>
                    <EditableText id="why-2-title" as="h4" className="font-medium text-blue-900 mb-2 tracking-wide" defaultText="Строгая логистика" />
                    <EditableText id="why-2-text" as="p" className="text-sm text-blue-600 font-light leading-relaxed" defaultText="Забор и доставка белья осуществляются строго по согласованному графику." />
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="w-14 h-14 bg-blue-900 text-cyan-500 flex items-center justify-center shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]">
                    <Briefcase strokeWidth={1.5} size={20} />
                  </div>
                  <div>
                    <EditableText id="why-3-title" as="h4" className="font-medium text-blue-900 mb-2 tracking-wide" defaultText="Удобный сервис" />
                    <EditableText id="why-3-text" as="p" className="text-sm text-blue-600 font-light leading-relaxed" defaultText="Электронный документооборот (ЭДО). Аренда белья под нужды отеля." />
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="w-14 h-14 bg-blue-900 text-cyan-500 flex items-center justify-center shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]">
                    <Shield strokeWidth={1.5} size={20} />
                  </div>
                  <div>
                    <EditableText id="why-4-title" as="h4" className="font-medium text-blue-900 mb-2 tracking-wide" defaultText="Бережное отношение" />
                    <EditableText id="why-4-text" as="p" className="text-sm text-blue-600 font-light leading-relaxed" defaultText="Штат опытных сотрудников гарантирует максимальную сохранность текстиля." />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto bg-cyan-500 text-blue-900 p-8 flex items-center justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#ffffff33] [clip-path:polygon(100%_0,100%_100%,0_0)]"></div>
              <div className="relative z-10 w-[60%]">
                <EditableText id="promo-title" as="h3" className="text-xl font-serif mb-2 font-bold" defaultText="Пробная стирка — бесплатно" />
                <EditableText id="promo-text" as="p" className="text-[#1e3a8acc] font-medium" defaultText="Мы заберём на тестовую стирку до 10 кг белого или цветного белья." />
              </div>
              <div className="bg-blue-900 text-white px-6 py-3 font-medium tracking-wider text-sm relative z-10">
                +7 (991) 112-56-86
              </div>
            </div>
          </div>
        </div>

        {/* PAGE 3: PRICES & CONTACTS (Dynamic Footer) */}
        <div className="w-[210mm] min-h-[297mm] bg-white text-blue-900 shadow-2xl print:shadow-none relative overflow-hidden flex flex-col print:page-break-after-always">
          
          {/* Left Edge Geometric Accent */}
          <div className="absolute top-[20%] left-0 w-[100px] h-[300px] bg-blue-100 z-0 [clip-path:polygon(0_0,100%_50%,0_100%)]"></div>
          
          {/* Top Right Geometric Accent */}
          <div className="absolute top-0 right-0 w-[250px] h-[250px] bg-[#06b6d41a] z-0 [clip-path:polygon(100%_0,100%_100%,0_0)]"></div>

          <div className="p-16 pl-20 flex-1 flex flex-col relative z-10">
            <div className="mb-12 flex items-end justify-between border-b border-blue-200 pb-6">
              <EditableText id="prices-title" as="h2" className="text-4xl font-serif text-blue-900" defaultText="Тарифы на услуги" />
              <p className="text-blue-500 tracking-widest uppercase text-xs font-medium">Прайс-лист</p>
            </div>
              
            <div className="space-y-0 mb-12 relative">
              {/* Price Item 1 */}
              <div className="flex items-center justify-between py-6 border-b border-blue-100 group">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-blue-50 flex items-center justify-center text-blue-700 shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] group-hover:bg-cyan-100 transition-colors">
                    <Bed size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <EditableText id="price-1-title" as="h4" className="text-lg font-medium text-blue-900" defaultText="Прямое бельё" />
                    <EditableText id="price-1-desc" as="p" className="text-blue-500 text-sm font-light mt-1" defaultText="Простыни, пододеяльники, покрывала" />
                    <div className="flex gap-3 mt-2 text-xs font-medium text-blue-400 uppercase tracking-wider">
                      <span>• Стирка</span>
                      <span>• Сушка</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-serif text-blue-900 flex items-baseline justify-end gap-1">
                    <EditableText id="price-1-price" as="span" defaultText="от 105 ₽" />
                    <EditableText id="price-1-unit" as="span" className="text-sm text-blue-400 font-sans font-light" defaultText=" / кг" />
                  </div>
                  <EditableText id="price-1-note" as="p" className="text-xs text-blue-400 mt-1 font-light" defaultText="Мин. заказ 5 кг" />
                </div>
              </div>

              {/* Price Item 2 */}
              <div className="flex items-center justify-between py-6 border-b border-blue-100 group">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-blue-50 flex items-center justify-center text-blue-700 shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] group-hover:bg-cyan-100 transition-colors">
                    <Droplets size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <EditableText id="price-2-title" as="h4" className="text-lg font-medium text-blue-900" defaultText="Махровые изделия" />
                    <EditableText id="price-2-desc" as="p" className="text-blue-500 text-sm font-light mt-1" defaultText="Полотенца, халаты, коврики" />
                    <div className="flex gap-3 mt-2 text-xs font-medium text-blue-400 uppercase tracking-wider">
                      <span className="text-cyan-600">• Гипоаллергенные средства</span>
                      <span>• Сушка</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-serif text-blue-900 flex items-baseline justify-end gap-1">
                    <EditableText id="price-2-price" as="span" defaultText="от 115 ₽" />
                    <EditableText id="price-2-unit" as="span" className="text-sm text-blue-400 font-sans font-light" defaultText=" / кг" />
                  </div>
                  <EditableText id="price-2-note" as="p" className="text-xs text-cyan-600 mt-1 font-medium" defaultText="Беспл. доставка от 5 000 ₽" />
                </div>
              </div>

              {/* Price Item 3 */}
              <div className="flex items-center justify-between py-6 border-b border-blue-100 group">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-blue-50 flex items-center justify-center text-blue-700 shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] group-hover:bg-cyan-100 transition-colors">
                    <Wind size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <EditableText id="price-3-title" as="h4" className="text-lg font-medium text-blue-900" defaultText="Подушки и Одеяла" />
                    <EditableText id="price-3-desc" as="p" className="text-blue-500 text-sm font-light mt-1" defaultText="Подушки (синтетика), одеяла, пледы" />
                    <div className="flex gap-3 mt-2 text-xs font-medium text-blue-400 uppercase tracking-wider">
                      <span>• Стирка</span>
                      <span>• Сушка</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-serif text-blue-900 flex items-baseline justify-end gap-1">
                    <EditableText id="price-3-price" as="span" defaultText="от 400 ₽" />
                    <EditableText id="price-3-unit" as="span" className="text-sm text-blue-400 font-sans font-light" defaultText=" / шт" />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 p-4 text-sm text-blue-600 font-light border-l-2 border-cyan-500 mb-auto">
              <span className="font-medium text-blue-900">Обратите внимание:</span> <EditableText id="price-note" as="span" defaultText="Срочный заказ рассчитывается с коэффициентом +50% к базовой стоимости." />
            </div>
          </div>

          {/* Diagonal Footer Section */}
          <div className="mt-auto bg-blue-900 text-white relative pt-24 pb-16 px-16 [clip-path:polygon(0_15%,100%_0,100%_100%,0_100%)]">
            {/* Background Image inside footer */}
            <div className="absolute inset-0 z-0 opacity-10 mix-blend-luminosity">
              <img 
                src="https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=800&q=80" 
                alt="Laundry Equipment" 
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-16 relative z-10">
              <div>
                <EditableText id="contact-title" as="h3" className="text-sm font-medium tracking-widest uppercase text-cyan-500 mb-6" defaultText="Контакты" />
                <div className="space-y-5 font-light text-[#ffffffcc]">
                  <div className="flex items-start gap-4">
                    <MapPin className="text-cyan-500 w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.5} />
                    <div>
                      <p className="font-medium text-white text-sm mb-1">Адрес</p>
                      <EditableText id="address-text" as="p" className="text-sm" defaultText="Мурманск, ул. Капитана Орликовой, 15, ТЦ 'Старт'" />
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <Phone className="text-cyan-500 w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.5} />
                    <div>
                      <p className="font-medium text-white text-sm mb-1">Телефон</p>
                      <EditableText id="phone-text" as="p" className="text-sm" defaultText="+7 (991) 112-56-86" />
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <Mail className="text-cyan-500 w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.5} />
                    <div>
                      <p className="font-medium text-white text-sm mb-1">Email</p>
                      <EditableText id="email-text" as="p" className="text-sm" defaultText="Partner.stirka@mail.ru" />
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <EditableText id="req-title" as="h3" className="text-sm font-medium tracking-widest uppercase text-cyan-500 mb-6" defaultText="Реквизиты" />
                <div className="bg-[#ffffff0d] backdrop-blur-sm border border-[#ffffff1a] p-6 rounded-none">
                  <EditableText id="req-company" as="p" className="font-serif text-lg mb-4 text-white" defaultText="ООО 'ВАШ ПАРТНЕР'" />
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm font-light text-[#ffffffb3]">
                    <p>ИНН:</p>
                    <EditableText id="req-inn" as="p" className="font-medium text-white" defaultText="5118006863" />
                    <p>КПП:</p>
                    <EditableText id="req-kpp" as="p" className="font-medium text-white" defaultText="511801001" />
                    <p>ОГРН:</p>
                    <EditableText id="req-ogrn" as="p" className="font-medium text-white" defaultText="1245100001882" />
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#ffffff1a] text-xs text-[#ffffff66] font-light flex justify-between">
                    <p>© 2026 ООО "ВАШ ПАРТНЕР"</p>
                    <p>ПН-ПТ: 9:00 - 18:00</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
      </div>
    </ContentContext.Provider>
  );
}
