import nodemailer from "nodemailer";
export function mailConfigured(){return !!(process.env.STRATO_SMTP_USER&&process.env.STRATO_SMTP_PASSWORD)}
export async function deliverMail({to,subject,text,attachments=[]}){
 if(!mailConfigured())throw Error("STRATO-Mailversand noch nicht eingerichtet: STRATO_SMTP_USER und STRATO_SMTP_PASSWORD in Vercel hinterlegen.");
 const user=process.env.STRATO_SMTP_USER;
 const transport=nodemailer.createTransport({host:"smtp.strato.de",port:465,secure:true,
   auth:{user,pass:process.env.STRATO_SMTP_PASSWORD},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:25000});
 const result=await transport.sendMail({from:user,to,replyTo:user,subject,text,attachments:attachments.map(a=>({
   filename:a.filename,content:Buffer.isBuffer(a.content)?a.content:Buffer.from(a.content,"base64"),contentType:"application/pdf"
 }))});
 if(!result.accepted?.length)throw Error("STRATO hat den Versand nicht bestätigt.");
 return {id:result.messageId};
}
