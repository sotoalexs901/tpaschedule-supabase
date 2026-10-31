import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase';

export const GSE_STATUS = { PENDING: 'PENDING_INSPECTION', IN: 'IN_SERVICE', OUT: 'OUT_OF_SERVICE' };
export const GSE_LOCATIONS = ['Parking Area 1', 'Parking Area 2', 'Maintenance Area', 'Other'];
export const GSE_TYPES = ['Baggage Cart', 'Baggage Tug', 'Belt Loader', 'Pushback Tractor', 'Tow Bar', 'Lav Cart', 'Regulated Garbage Cart', 'Water Cart', 'Golf Cart', 'Dolly', 'Stairs', 'Other'];
const idOf = u => String(u?.id || u?.uid || u?.employeeId || '');
const nameOf = u => u?.displayName || u?.fullName || u?.name || u?.username || '';
const validMoney = value => Number.isFinite(Number(value)) && Number(value) >= 0;
export const GSE_FUEL_TYPES = ['GASOLINE', 'DIESEL'];
function assetFields({motorized=false,vinNumber='',year='',fuelType=''}) {
  if (!motorized) return {motorized:false,vinNumber:'',year:null,fuelType:''};
  const vin=String(vinNumber||'').trim().toUpperCase();
  const yr=Number(year);
  if (!vin || vin.length>60) throw new Error('VIN / chassis number is required (max 60 characters).');
  if (!Number.isInteger(yr) || yr<1950 || yr>new Date().getFullYear()+1) throw new Error('Enter a valid equipment year.');
  if (!GSE_FUEL_TYPES.includes(fuelType)) throw new Error('Select Gasoline or Diesel.');
  return {motorized:true,vinNumber:vin,year:yr,fuelType};
}
const num = value => Math.round(Number(value) * 100) / 100;
export function watchGse(callback, onError) { return onSnapshot(collection(db, 'gse_equipment'), snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.archived !== true)), onError); }
export function watchGseRepairs(callback, onError) { return onSnapshot(collection(db, 'gse_repairs'), snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError); }
export function watchGseLocations(callback, onError) { return onSnapshot(collection(db, 'operational_locations'), snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false)), onError); }
export function getGseCode(raw) { const value = String(raw || '').trim(); if (!value) return ''; try { const url = new URL(value); return String(url.searchParams.get('gse') || url.pathname.split('/').filter(Boolean).pop() || '').trim().toUpperCase(); } catch { return value.toUpperCase(); } }
export function gpsDistanceMeters(a,b) { const rad = n => n * Math.PI / 180; const p1=rad(Number(a.latitude)),p2=rad(Number(b.latitude)),dlat=p2-p1,dlon=rad(Number(b.longitude)-Number(a.longitude)); const h=Math.sin(dlat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dlon/2)**2; return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h))); }
export function nearestGseLocation(gps, locations) { if (!gps) return null; const matches=locations.filter(l=>Number.isFinite(Number(l.latitude))&&Number.isFinite(Number(l.longitude))).map(l=>({...l,distanceMeters:gpsDistanceMeters(gps,l)})).sort((a,b)=>a.distanceMeters-b.distanceMeters); const closest=matches[0]; return closest && closest.distanceMeters <= Number(closest.radiusMeters || 60) + Number(gps.accuracyMeters || 0) ? closest : null; }
export async function uploadGsePhotos(code, files) { const id=getGseCode(code); if (!/^[A-Z0-9_-]{3,60}$/.test(id)) throw new Error('Invalid equipment ID.'); if (!files?.length || files.length > 2) throw new Error('Select one or two photos.'); const result=[]; for(const file of files){ if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>8*1024*1024) throw new Error('Each photo must be JPG, PNG or WebP, max 8 MB.'); const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'; const path=`gse_equipment/${id}/inspections/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`; const object=storageRef(getStorage(),path); await uploadBytes(object,file,{contentType:file.type,customMetadata:{equipmentId:id}}); result.push({url:await getDownloadURL(object),path}); } return result; }
export async function inspectGse({ code, condition, location, locationId, gps, notes, photos, estimatedRepairCost, user }) {
  const employeeId=idOf(user), id=getGseCode(code); if(!employeeId) throw new Error('User identity is required.'); if(!/^[A-Z0-9_-]{3,60}$/.test(id)) throw new Error('Invalid equipment ID.');
  if(!location?.trim()) throw new Error('Select a parking location.'); if(!['IN_SERVICE','OUT_OF_SERVICE'].includes(condition)) throw new Error('Invalid condition.');
  if(!Array.isArray(photos)||photos.length<1||photos.length>2) throw new Error('One or two equipment photos are required.');
  if(condition===GSE_STATUS.OUT && (!notes?.trim()||!validMoney(estimatedRepairCost))) throw new Error('Defect description and estimated repair cost (USD) are required.');
  const ref=doc(db,'gse_equipment',id);
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error('Equipment not registered.');const current=snap.data();if(current.status===GSE_STATUS.OUT&&condition===GSE_STATUS.IN)throw new Error('Management must authorize reinspection first.');
    const event=doc(collection(db,'gse_inspections'));const patch={status:condition,location,locationId:locationId||'',lastGps:gps||null,photos,lastInspectionAt:serverTimestamp(),lastInspectedBy:employeeId,updatedAt:serverTimestamp()};
    if(condition===GSE_STATUS.OUT){patch.estimatedRepairCost=num(estimatedRepairCost);patch.outOfServiceAt=serverTimestamp();patch.repairStatus='OPEN';}
    tx.update(ref,patch);tx.set(event,{equipmentId:id,condition,location,locationId:locationId||'',gps:gps||null,photos,notes:String(notes||'').trim(),estimatedRepairCost:condition===GSE_STATUS.OUT?num(estimatedRepairCost):null,employeeId,employeeName:nameOf(user),createdAt:serverTimestamp(),eventType:'INSPECTION'});
  });
}
export async function registerGse({code,type,serialNumber='',location,locationId='',motorized=false,vinNumber='',year='',fuelType='',user}){const id=getGseCode(code);if(!/^[A-Z0-9_-]{3,60}$/.test(id))throw new Error('Equipment ID must contain 3–60 letters, numbers, underscores or hyphens.');if(!type?.trim()||!location?.trim())throw new Error('Type and location are required.');if(!idOf(user))throw new Error('User identity required.');const ref=doc(db,'gse_equipment',id);await runTransaction(db,async tx=>{if((await tx.get(ref)).exists())throw new Error('Equipment ID already exists.');tx.set(ref,{equipmentCode:id,equipmentType:type.trim(),serialNumber:serialNumber.trim(),...assetFields({motorized,vinNumber,year,fuelType}),location,locationId,status:GSE_STATUS.PENDING,createdBy:idOf(user),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),gpsDeviceId:null});});}
export async function releaseGse({equipment,user,notes,finalRepairCost}){if(!notes?.trim())throw new Error('Release notes are required.');if(!validMoney(finalRepairCost))throw new Error('Enter the actual final repair cost (USD), including 0 for no cost.');if(!idOf(user))throw new Error('User identity required.');const ref=doc(db,'gse_equipment',equipment.id);await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists()||snap.data().status!==GSE_STATUS.OUT)throw new Error('Equipment is not currently Out of Service.');const current=snap.data();const event=doc(collection(db,'gse_inspections'));const repair=doc(collection(db,'gse_repairs'));tx.update(ref,{status:GSE_STATUS.PENDING,releaseAuthorizedBy:idOf(user),releaseNotes:notes.trim(),lastRepairCost:num(finalRepairCost),repairStatus:'COMPLETED_PENDING_INSPECTION',updatedAt:serverTimestamp()});tx.set(repair,{equipmentId:equipment.id,equipmentType:current.equipmentType||'',estimatedCost:num(current.estimatedRepairCost||0),finalCost:num(finalRepairCost),completedAt:serverTimestamp(),authorizedById:idOf(user),authorizedByName:nameOf(user),notes:notes.trim(),eventType:'REPAIR_COMPLETED'});tx.set(event,{equipmentId:equipment.id,eventType:'MANAGEMENT_RELEASE',employeeId:idOf(user),notes:notes.trim(),finalRepairCost:num(finalRepairCost),createdAt:serverTimestamp()});});}
export async function updateGseGpsDevice({equipment,user,gpsDeviceId='',gpsProvider='',notes=''}){if(!idOf(user))throw new Error('User identity required.');if(String(user.role||'').toLowerCase()!=='station_manager'&&String(user.role||'').toLowerCase()!=='duty_manager')throw new Error('Management access required.');const ref=doc(db,'gse_equipment',equipment.id);await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error('Equipment not found.');const event=doc(collection(db,'gse_inspections'));tx.update(ref,{gpsDeviceId:String(gpsDeviceId).trim()||null,gpsProvider:String(gpsProvider).trim(),gpsDeviceNotes:String(notes).trim(),gpsDeviceUpdatedAt:serverTimestamp(),updatedAt:serverTimestamp()});tx.set(event,{equipmentId:equipment.id,eventType:'GPS_DEVICE_UPDATED',employeeId:idOf(user),gpsDeviceId:String(gpsDeviceId).trim()||null,gpsProvider:String(gpsProvider).trim(),createdAt:serverTimestamp()});});}

// Management-only asset corrections. Archive instead of deleting historical evidence.
export async function updateGseEquipment({equipment,user,type,serialNumber,location,locationId,motorized=false,equipmentNumber="",vinNumber="",year="",fuelType="",reason}) {
  if (!['station_manager','duty_manager'].includes(String(user?.role||'').toLowerCase())) throw new Error('Management access required.');
  if (!idOf(user)) throw new Error('User identity required.');
  if (!type?.trim() || !location?.trim() || !reason?.trim()) throw new Error('Type, location and edit reason are required.');
  const ref=doc(db,'gse_equipment',equipment.id);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if (!snap.exists() || snap.data().archived===true) throw new Error('Equipment is not active.');
    const before=snap.data();
    const patch={equipmentType:type.trim(),serialNumber:String(serialNumber||'').trim(),equipmentNumber:motorized?String(equipmentNumber||'').trim():'',...assetFields({motorized,vinNumber,year,fuelType}),location:location.trim(),locationId:locationId||'',updatedAt:serverTimestamp(),lastEditedBy:idOf(user)};
    const event=doc(collection(db,'gse_inspections'));
    tx.update(ref,patch);
    tx.set(event,{equipmentId:equipment.id,eventType:'EQUIPMENT_EDITED',before:{equipmentType:before.equipmentType||'',serialNumber:before.serialNumber||'',equipmentNumber:before.equipmentNumber||'',motorized:before.motorized??null,vinNumber:before.vinNumber||'',year:before.year??null,fuelType:before.fuelType||'',location:before.location||'',locationId:before.locationId||''},after:{equipmentType:patch.equipmentType,serialNumber:patch.serialNumber,equipmentNumber:patch.equipmentNumber,motorized:patch.motorized,vinNumber:patch.vinNumber,year:patch.year,fuelType:patch.fuelType,location:patch.location,locationId:patch.locationId},reason:reason.trim(),employeeId:idOf(user),employeeName:nameOf(user),createdAt:serverTimestamp()});
  });
}
export async function archiveGseEquipment({equipment,user,reason}) {
  if (String(user?.role||'').toLowerCase()!=='station_manager') throw new Error('Only Station Manager can remove equipment from the active register.');
  if (!idOf(user)||!reason?.trim()) throw new Error('Identity and removal reason are required.');
  const ref=doc(db,'gse_equipment',equipment.id);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if (!snap.exists()||snap.data().archived===true) throw new Error('Equipment already removed or not found.');
    const event=doc(collection(db,'gse_inspections'));
    tx.update(ref,{archived:true,archivedAt:serverTimestamp(),archivedBy:idOf(user),archiveReason:reason.trim(),updatedAt:serverTimestamp()});
    tx.set(event,{equipmentId:equipment.id,eventType:'EQUIPMENT_ARCHIVED',reason:reason.trim(),employeeId:idOf(user),employeeName:nameOf(user),createdAt:serverTimestamp()});
  });
}

// One atomic registration + first inspection: no second form or orphan pending asset.
export async function registerAndInspectGse({code,type,serialNumber='',motorized=false,equipmentNumber='',vinNumber='',year='',fuelType='',location,locationId='',gps=null,condition,notes='',photos,estimatedRepairCost='',user}) {
  const id=getGseCode(code),employeeId=idOf(user);
  if(!employeeId)throw new Error('User identity is required.');
  if(!/^[A-Z0-9_-]{3,60}$/.test(id))throw new Error('Invalid equipment ID.');
  if(!type?.trim()||!location?.trim()||!locationId)throw new Error('Equipment type and saved TPA location are required.');
  if(![GSE_STATUS.IN,GSE_STATUS.OUT].includes(condition))throw new Error('Select equipment condition.');
  if(!Array.isArray(photos)||photos.length<1||photos.length>2)throw new Error('One or two photos required.');
  if(condition===GSE_STATUS.OUT&&(!notes.trim()||estimatedRepairCost===''||!validMoney(estimatedRepairCost)))throw new Error('Defect description and estimated repair cost are required.');
  const details=assetFields({motorized,vinNumber,year,fuelType});
  if(motorized&&!String(equipmentNumber||'').trim())throw new Error('Equipment / Fleet Number is required.');
  const ref=doc(db,'gse_equipment',id);
  await runTransaction(db,async tx=>{
    if((await tx.get(ref)).exists())throw new Error('Equipment ID already exists. Use Edit or Inspect Existing.');
    const event=doc(collection(db,'gse_inspections'));
    const repairFields=condition===GSE_STATUS.OUT?{estimatedRepairCost:num(estimatedRepairCost),outOfServiceAt:serverTimestamp(),repairStatus:'OPEN'}:{};
    tx.set(ref,{equipmentCode:id,equipmentType:type.trim(),serialNumber:String(serialNumber).trim(),equipmentNumber:motorized?String(equipmentNumber).trim():'',...details,location,locationId,lastGps:gps||null,photos,status:condition,...repairFields,createdBy:employeeId,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastInspectionAt:serverTimestamp(),lastInspectedBy:employeeId,gpsDeviceId:null,archived:false});
    tx.set(event,{equipmentId:id,eventType:'INITIAL_INSPECTION',condition,location,locationId,gps:gps||null,photos,notes:String(notes).trim(),estimatedRepairCost:condition===GSE_STATUS.OUT?num(estimatedRepairCost):null,employeeId,employeeName:nameOf(user),createdAt:serverTimestamp()});
  });
}
