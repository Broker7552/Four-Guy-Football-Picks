(function(root){
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function toEastern(value){
    if(!value || !Number.isFinite(Date.parse(value))) return '';
    const p=Object.fromEntries(format.formatToParts(new Date(value)).map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
  }
  function fromEastern(value){
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a valid Eastern kickoff time.');
    const target=Date.parse(value+'Z');let instant=target;
    for(let i=0;i<3;i++) instant+=target-Date.parse(toEastern(new Date(instant).toISOString())+'Z');
    const result=new Date(instant).toISOString();
    if(toEastern(result)!==value) throw new Error('That Eastern time does not exist. Check the kickoff time.');
    return result;
  }
  const api={toEastern,fromEastern};root.CollegeRevisionTime=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
