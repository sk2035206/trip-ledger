import type { CSSProperties } from 'react';
const paths: Record<string, string> = {
    share: 'M12 16V3 m-5 5 5-5 5 5 M5 12H3v9h18v-9h-2',
    bike: 'M8 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M24 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 16l5-8 5 8H4 M8 5h4 M10 8h8 M16 4h3l1 12',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    mountain: 'm2 20 7-14 5 9 3-5 5 10H2Zm4-8 3 2 2-2',
    search: 'm21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    plus: 'M12 5v14 M5 12h14', close: 'm6 6 12 12 M18 6 6 18',
    arrow: 'M5 12h14 m-6-6 6 6-6 6', up: 'm6 14 6-6 6 6', down: 'm6 10 6 6 6-6',
    route: 'M5 5h10a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h10 M5 2v6 M2 5h6 M19 18v6 M16 21h6',
    check: 'm5 12 4 4L19 6', book: 'M4 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-3H4V3Zm10 4a4 4 0 0 1 4-4h4v15h-4a4 4 0 0 0-4 3',
    food: 'M4 3v6a3 3 0 0 0 6 0V3 M7 3v19 M18 3c-5 4-5 11 0 11V3Zm0 11v8',
    hotel: 'M3 21V5h18v16 M8 21v-6h8v6 M7 9h2 M15 9h2 M2 21h20',
    transport: 'M5 17V4h14v13H5Zm0 0-2 5 m16-5 2 5 M5 11h14 M8 15h1 M15 15h1',
    save: 'M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3 M7 21v-7h10v7',
    download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5', upload: 'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5',
    trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
    target: 'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    grip: 'M8 5h1 M15 5h1 M8 12h1 M15 12h1 M8 19h1 M15 19h1',
    walk: 'm12 8-3 5 4 3-2 6 M9 13l-4 3 M12 8l4 4h4 M15 4h.01 M13 16l5 5',
    leaf: 'M20 3C7 1 0 10 6 16s15-1 14-13ZM5 20 16 9',
};
export function Icon({ name, size = 20, style }: {
    name: string;
    size?: number;
    style?: CSSProperties;
}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name] || paths.pin}/></svg>; }
