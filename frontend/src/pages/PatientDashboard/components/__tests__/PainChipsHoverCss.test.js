// =====================================================
// HF#10 Fix B — design contract test для chip selected vs :hover
// =====================================================
// jsdom не применяет CSS, поэтому проверить визуальный регрессию
// «hover серит selected chip» нельзя через unit-тест. Делаем design
// contract: PainComponents.css обязан содержать :not(--selected) клозы
// в :hover-правилах для всех 3 chip-вариантов.
//
// Раньше `:hover:not(:disabled)` (specificity 0,2,0) перекрывал
// `.pd-pain-XXX-chip--selected` (0,1,0). После клика chip получала и
// `--selected`, и `:hover` одновременно (mouse position сразу на chip'е) —
// hover wins → серый фон + белый текст из .selected → user видел
// «последняя clicked chip серая, предыдущая зелёная».
// =====================================================

import fs from 'fs';
import path from 'path';

const cssPath = path.resolve(
  __dirname,
  '..',
  'PainComponents.css'
);

describe('PainComponents.css — Fix B :hover не перекрывает .selected', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  it('pd-pain-loc-chip:hover исключает --selected', () => {
    expect(css).toMatch(
      /\.pd-pain-loc-chip:hover:not\(:disabled\):not\(\.pd-pain-loc-chip--selected\)/
    );
  });

  it('pd-pain-trigger-chip:hover исключает --selected', () => {
    expect(css).toMatch(
      /\.pd-pain-trigger-chip:hover:not\(:disabled\):not\(\.pd-pain-trigger-chip--selected\)/
    );
  });

  it('pd-pain-character-chip:hover исключает --selected', () => {
    expect(css).toMatch(
      /\.pd-pain-character-chip:hover:not\(:disabled\):not\(\.pd-pain-character-chip--selected\)/
    );
  });
});
