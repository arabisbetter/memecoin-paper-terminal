export function jwtSessionId(authHeader:string){
  try{
    const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):authHeader
    const payload=token.split('.')[1]
    if(!payload)return null
    const claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))
    const sid=String(claims?.session_id||'')
    return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sid)?sid:null
  }catch{return null}
}

export async function validateActiveSession(
  admin:any,
  userId:string,
  authHeader:string,
  requireAal2=false
){
  const sessionId=jwtSessionId(authHeader)
  if(!sessionId)return false
  const {data,error}=await admin.rpc('paper_validate_server_session_v1',{
    p_user_id:userId,
    p_session_id:sessionId,
    p_require_aal2:requireAal2
  })
  if(error)throw new Error(error.message)
  return data===true
}

export async function consumeServerRateLimit(
  admin:any,
  scope:string,
  subject:string,
  limit:number,
  windowSeconds:number
){
  const {data,error}=await admin.rpc('paper_consume_server_rate_limit_v1',{
    p_scope:scope,
    p_subject:subject,
    p_limit:limit,
    p_window_seconds:windowSeconds
  })
  if(error)throw new Error(error.message)
  return data as {allowed?:boolean;remaining?:number;retry_after_seconds?:number}
}
