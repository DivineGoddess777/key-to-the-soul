// PA destination rules effective in 2026. County is supplied with the delivery
// address; no ZIP-only geocoding or third-party tax service is implied.
// https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/sales-use-and-hotel-occupancy-tax/local-sales-tax
const rates={OTHER_PENNSYLVANIA:600,ALLEGHENY:700,PHILADELPHIA:800};
export function pennsylvaniaCandleTax({cart,customer,shippingCents}){
 const rate=rates[customer.address.county];if(!rate)throw Object.assign(Error('Choose the Pennsylvania county for your delivery address so we can calculate tax.'),{status:422});
 const taxable=cart.subtotalCents+shippingCents;
 return {reviewed:true,taxCents:Math.floor((taxable*rate+5000)/10000),reference:'PA-2026-destination-'+customer.address.county+'-'+rate};
}
