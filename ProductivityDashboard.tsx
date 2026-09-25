import React, { useEffect, useState } from 'react';
import { Clock, Box } from 'lucide-react';
import { fetchSheetData } from '../services/dataConnector';

interface StreetStats {
  street: string;
  totalBoxes: number;
  avgTime: number;
  addressCount: number;
}

export const ProductivityDashboard: React.FC = () => {
  const [stats, setStats] = useState<StreetStats[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchSheetData();
        if (data.length === 0) return;

        const streetMap: Record<string, StreetStats> = {};

        data.forEach((item: any) => {
          const street = item.address.substring(0, 4); // E.g., 'B4VA'
          const boxes = item.qte;

          if (!streetMap[street]) {
            streetMap[street] = { street, totalBoxes: 0, avgTime: 120, addressCount: 0 };
          }
          streetMap[street].totalBoxes += boxes;
          streetMap[street].addressCount += 1;
        });

        setStats(Object.values(streetMap));
      } catch (err) {
        console.error('Error loading sheet data:', err);
      }
    }
    loadData();
  }, []);

  return (
    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
      <h2 className="text-xl font-black text-white mb-6">Produtividade por Rua</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.street} className="bg-slate-950 p-4 rounded-xl border border-white/5">
            <div className="text-lg font-black text-emerald-400 mb-2">{stat.street}</div>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
              <Box size={14} /> {stat.totalBoxes} caixas
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <Clock size={14} /> {stat.avgTime}s médio
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
