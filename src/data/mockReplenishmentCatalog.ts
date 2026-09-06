/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Catálogo Base de Artigos e Embalagens Padrão para Apoio Offline ao Reabastecimento
 * Permite validações locais instantâneas no PDT sem depender de conexão com o WMS / AS/400.
 */

import { CatalogArticlePackaging } from '../types';

export const DEFAULT_REPLENISHMENT_CATALOG: CatalogArticlePackaging[] = [
  {
    artigo: '78910001',
    descricao: 'DETERGENTE CONCENTRADO 500ML',
    embalagemPadrao: 'CX-24',
    qtdPadrao: 24,
    qtdMinima: 20,
    qtdMaxima: 28,
    isPallet: false,
    setorSugerido: '87',
    ruaSugerida: '8701'
  },
  {
    artigo: '78910002',
    descricao: 'DESINFETANTE MULTIUSO 1L',
    embalagemPadrao: 'CX-12',
    qtdPadrao: 12,
    qtdMinima: 10,
    qtdMaxima: 14,
    isPallet: false,
    setorSugerido: '87',
    ruaSugerida: '8702'
  },
  {
    artigo: '78910003',
    descricao: 'AMACIANTE TOQUE SUAVE 2L',
    embalagemPadrao: 'CX-6',
    qtdPadrao: 6,
    qtdMinima: 5,
    qtdMaxima: 7,
    isPallet: false,
    setorSugerido: '87',
    ruaSugerida: '8703'
  },
  {
    artigo: '78920010',
    descricao: 'SABAO EM PO LAVAGEM PROFUNDA 1KG',
    embalagemPadrao: 'FD-18',
    qtdPadrao: 18,
    qtdMinima: 15,
    qtdMaxima: 20,
    isPallet: false,
    setorSugerido: '88',
    ruaSugerida: '8801'
  },
  {
    artigo: '78920020',
    descricao: 'AGUA SANITARIA CLORADA 2L',
    embalagemPadrao: 'FD-6',
    qtdPadrao: 6,
    qtdMinima: 5,
    qtdMaxima: 8,
    isPallet: false,
    setorSugerido: '88',
    ruaSugerida: '8802'
  },
  {
    artigo: '78930050',
    descricao: 'PAPEL HIGIENICO COMPACTO 16UN',
    embalagemPadrao: 'FD-8',
    qtdPadrao: 8,
    qtdMinima: 6,
    qtdMaxima: 10,
    isPallet: false,
    setorSugerido: '89',
    ruaSugerida: '8901'
  },
  {
    artigo: '78930060',
    descricao: 'TOALHA DE PAPEL DUPLA 2UN',
    embalagemPadrao: 'CX-12',
    qtdPadrao: 12,
    qtdMinima: 10,
    qtdMaxima: 14,
    isPallet: false,
    setorSugerido: '89',
    ruaSugerida: '8902'
  },
  {
    artigo: '78940001',
    descricao: 'PALLET FECHADO BEBIDA ISOTONICA 500ML',
    embalagemPadrao: 'PLT-60',
    qtdPadrao: 720, // 60 caixas x 12
    qtdMinima: 720,
    qtdMaxima: 720,
    isPallet: true,
    caixasPorPallet: 60,
    setorSugerido: '90',
    ruaSugerida: '9001'
  },
  {
    artigo: '78940002',
    descricao: 'PALLET FECHADO ENERGETICO 250ML',
    embalagemPadrao: 'PLT-80',
    qtdPadrao: 1920, // 80 packs x 24
    qtdMinima: 1920,
    qtdMaxima: 1920,
    isPallet: true,
    caixasPorPallet: 80,
    setorSugerido: '90',
    ruaSugerida: '9002'
  },
  {
    artigo: 'ART-1001',
    descricao: 'PRODUTO HOMOLOGADO SETOR 87',
    embalagemPadrao: 'CX-20',
    qtdPadrao: 20,
    qtdMinima: 18,
    qtdMaxima: 22,
    isPallet: false,
    setorSugerido: '87',
    ruaSugerida: '8701'
  },
  {
    artigo: 'ART-1002',
    descricao: 'PRODUTO HOMOLOGADO SETOR 88',
    embalagemPadrao: 'CX-15',
    qtdPadrao: 15,
    qtdMinima: 12,
    qtdMaxima: 18,
    isPallet: false,
    setorSugerido: '88',
    ruaSugerida: '8801'
  }
];

export function findArticleInCatalog(code: string, catalog: CatalogArticlePackaging[] = DEFAULT_REPLENISHMENT_CATALOG): CatalogArticlePackaging | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return catalog.find(item => 
    item.artigo.toUpperCase() === normalized || 
    item.descricao.toUpperCase().includes(normalized)
  ) || null;
}
