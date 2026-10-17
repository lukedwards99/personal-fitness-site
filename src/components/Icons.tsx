import type { SVGProps } from 'react';
export function Arrow({diagonal = false, ...props}: SVGProps<SVGSVGElement> & {diagonal?: boolean}) {
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{diagonal ? <path d="M6 18 18 6M6 6h12v12"/> : <path d="M4 12h15m-6-6 6 6-6 6"/>}</svg>;
}
export function Mark(props: SVGProps<SVGSVGElement>) { return <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" {...props}><path d="M6 10v12m5-16v20m10-20v20m5-16v12M11 16h10M3 16h3m20 0h3"/></svg>; }
