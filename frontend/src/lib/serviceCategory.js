/**
 * The category a service is listed under — same rule everywhere (salon
 * Services page, new-appointment page, customer booking, public menu) and in
 * the backend (`_svc_bucket` in server.py):
 *   sub_category → legacy `category` (unless it is just the type
 *   "Services"/"Packages") → "General".
 */
export const serviceCategoryOf = (s) => {
  const sub = String(s?.sub_category || '').trim();
  if (sub) return sub;
  const cat = String(s?.category || '').trim();
  return cat && !['services', 'packages', 'package'].includes(cat.toLowerCase()) ? cat : 'General';
};

export default serviceCategoryOf;
