import {redirect} from "next/navigation";
export default async function Investigation({params}:{params:Promise<{id:string}>}){redirect("/canvas?task="+encodeURIComponent((await params).id));}
