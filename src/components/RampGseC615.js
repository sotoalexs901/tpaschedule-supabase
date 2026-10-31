// Based on C615 Daily Equipment Safety / Operational Checklist, revision 09/07/23.
// N/A is an app convenience for questions that do not apply to a particular unit.
export const C615_GROUPS = {
  belt: {title:'Belt Loaders', types:['Belt Loader'], questions:[
    'Damage check (body, windshield, etc.)','Fuel level adequate for operation','Emergency and foot brake working','Lights, horn and controls working','All rubber bumpers in place and in good condition','Hand rail locking pin available','Belt free of tears','Tire pressure adequate','No fluid pooling under unit']},
  tug: {title:'Tugs / Pushbacks / Trucks', types:['Baggage Tug','Pushback Tractor','Golf Cart'], questions:[
    'Damage check (body, windshield, etc.)','Fuel level adequate for operation','Emergency and foot brake working','Lights, horn and controls working','Tire pressure adequate','No fluid pooling under unit','Safety rails, stabilizers and doors working']},
  lav: {title:'Potable Water / LAV Carts', types:['Lav Cart','Water Cart'], questions:[
    'Brake working','All rubber bumpers in place and in good condition','Hoses free of cracks, tears and frays','Fluid level adequate for operation (if applicable)','LAV meter working (resets to zero)']},
  gpu: {title:'GPU / Air Carts', types:['GPU','Air Cart'], questions:[
    'Power cord / hose free of cracks, tears and frays','Brake working','Fuel level adequate for operation (if applicable)','DEF level adequate for operation (if applicable)']},
  bag: {title:'Bag Carts', types:['Baggage Cart','Dolly','Regulated Garbage Cart'], questions:[
    'All rubber bumpers in place and in good condition','Brakes working']},
  tow: {title:'Towbar', types:['Tow Bar'], questions:[
    'Damage check','Hydraulic pump working and no leaks','All bolts and pins in place and not bent','Tires and axles in good condition','Bar shaft free of bends and cracks']},
};
export const C615_ORDER=Object.keys(C615_GROUPS);
export function c615GroupForType(type){return C615_ORDER.find(k=>C615_GROUPS[k].types.includes(type))||''}
