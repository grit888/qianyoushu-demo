(function(root){
  'use strict';
  const validMonth=/^20\d{2}-(0[1-9]|1[0-2])$/;
  const cents=value=>{if(value===null||value===undefined)return null;if(!Number.isSafeInteger(value)||value<0)throw Error('金额必须是非负整数分。');return value};
  function calculate(input){
    if(!input||typeof input!=='object'||!validMonth.test(input.month||''))throw Error('月份格式无效。');
    if(typeof input.scope!=='string'||!input.scope.trim()||input.scope.length>100)throw Error('账单范围无效。');
    const income=cents(input.income)??0,grossExpense=cents(input.grossExpense)??0,offsets=cents(input.offsets)??0;
    const pending=Number.isInteger(input.pending)&&input.pending>=0?input.pending:0;
    const openingBalance=cents(input.openingBalance),actualBalance=cents(input.actualBalance);
    const netExpense=grossExpense-offsets;if(netExpense<0)throw Error('抵扣金额不能超过原始消费。');
    const theoreticalBalance=openingBalance===null?null:openingBalance+income-netExpense;
    const difference=theoreticalBalance===null||actualBalance===null?null:actualBalance-theoreticalBalance;
    const status=actualBalance===null||openingBalance===null?'incomplete':difference===0?'matched':'difference';
    const categories=Array.isArray(input.categories)?input.categories.map(([name,value])=>{if(typeof name!=='string'||!name.trim()||!Number.isSafeInteger(value)||value<0)throw Error('分类汇总无效。');return[name,value]}):[];
    return{month:input.month,scope:input.scope,income,grossExpense,offsets,netExpense,pending,categories,coverage:input.coverage||{first:'',last:''},openingBalance,actualBalance,theoreticalBalance,difference,budgetDifference:cents(input.budgetDifference),status};
  }
  root.QYSMonthlyClose=Object.freeze({calculate});
})(globalThis);

